import {afterEach, expect, it, vi} from 'vitest';
import {createImageEditor} from '../src/ui';
import {createBlobSource, DEFAULT_IMAGE_SPEC} from '../src/index';
import type {ImageDetection, ImageProcessor, ImageSpec} from '../src/contracts';
import {mountCornerEditor} from '../src/corner-editor';
vi.mock('../src/ui-dom.js', async () => ({...await vi.importActual<typeof import('../src/ui-dom')>('../src/ui-dom'),
    loadPreviewImage: async () => {const image = document.createElement('img'); Object.defineProperties(image, {naturalWidth: {value: 400}, naturalHeight: {value: 400}}); return image;}}));
vi.mock('../src/corner-editor.js', () => ({mountCornerEditor: vi.fn(async () => ({destroy() {}}))}));
afterEach(() => {vi.unstubAllGlobals(); vi.clearAllMocks();});
const quad: ImageSpec = {version: 1, selection: {kind: 'quad', points: [{x: 0.1, y: 0.1}, {x: 0.9, y: 0.1}, {x: 0.9, y: 0.9}, {x: 0.1, y: 0.9}]}};
async function fixture() {
    vi.stubGlobal('URL', {createObjectURL: () => 'blob:preview', revokeObjectURL: vi.fn()});
    let finish!: (result: ImageDetection) => void;
    const detect = vi.fn(() => new Promise<ImageDetection>(resolve => {finish = resolve;}));
    const processor = {detect, process: vi.fn(async (source: {id: string}, _spec: ImageSpec, opts: {purpose?: string}) => ({sourceId: source.id, blob: new Blob(), width: 400, height: 400,
        mimeType: 'image/png', byteLength: 0, changed: true, purpose: opts.purpose ?? 'export'}))} as unknown as ImageProcessor;
    const host = document.createElement('div'), items = ['a', 'b'].map(id => ({id, revision: 0,
        original: createBlobSource(new Blob(), {id, revision: '1', name: id}), spec: DEFAULT_IMAGE_SPEC}));
    const editor = createImageEditor(host, {processor, items, locale: 'zh-CN'});
    await vi.waitFor(() => expect(host.querySelector('.image-editor__surface')).not.toBeNull());
    host.querySelector<HTMLButtonElement>('[data-tool=quad]')!.click(); await vi.waitFor(() => expect(detect).toHaveBeenCalledOnce());
    return {host, editor, processor, finish: (value: ImageDetection) => finish(value)};
}
it('keeps manual adjustments made while automatic detection is pending', async () => {
    const {host, editor, finish} = await fixture();
    const update = vi.mocked(mountCornerEditor).mock.calls.at(-1)![4]; update(quad);
    finish({status: 'detected', spec: {version: 1, selection: {kind: 'quad', points: [{x: 0.2, y: 0.2}, {x: 0.8, y: 0.2}, {x: 0.8, y: 0.8}, {x: 0.2, y: 0.8}]}}});
    await vi.waitFor(() => expect(host.textContent).toContain('已保留手动调整'));
    expect(editor.getItems()[0].spec).toEqual(quad); await editor.destroy();
});
it('discards automatic corners after switching to another image', async () => {
    const {editor, finish} = await fixture(); await editor.activate('b'); finish({status: 'detected', spec: quad});
    await Promise.resolve(); await Promise.resolve(); expect(editor.getItems()[1].spec).toEqual(DEFAULT_IMAGE_SPEC);
    expect(editor.getItems()[0].spec).not.toEqual(quad); await editor.destroy();
});
it('retains a manual quad when no boundary is found', async () => {
    const {host, editor, finish} = await fixture(); finish({status: 'not-found'});
    await vi.waitFor(() => expect(host.textContent).toContain('未识别到清晰边界'));
    expect(editor.getItems()[0].spec.selection).toEqual({kind: 'quad', points: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}]}); await editor.destroy();
});
it('aborts an apply waiting for a detector that ignores cancellation', async () => {
    const {editor, finish} = await fixture(), cancel = new AbortController();
    const applying = editor.prepare({signal: cancel.signal}); cancel.abort();
    await expect(applying).rejects.toThrow('aborted'); finish({status: 'not-found'}); await editor.destroy();
});
it('applies only to the working image and leaves the previous state intact after a failed preview', async () => {
    const {host, editor, processor, finish} = await fixture(); finish({status: 'detected', spec: quad});
    await vi.waitFor(() => expect(host.textContent).toContain('已识别边界'));
    await editor.apply({signal: new AbortController().signal});
    expect(editor.getItems()[0].spec).toEqual({version: 2, steps: [quad.selection], selection: {kind: 'none'}});
    host.querySelector<HTMLButtonElement>('[data-tool=rect]')!.click();
    await vi.waitFor(() => expect(host.querySelector('.image-editor__rect')).not.toBeNull());
    const before = editor.getItems();
    vi.mocked(processor.process).mockRejectedValueOnce(new Error('decode-failed'));
    await expect(editor.apply({signal: new AbortController().signal})).rejects.toThrow('decode-failed');
    expect(host.querySelector<HTMLElement>('.image-editor')!.inert).toBe(false);
    expect(editor.getItems()).toEqual(before);
    await editor.apply({signal: new AbortController().signal});
    const prepared = await editor.prepare({signal: new AbortController().signal});
    expect(prepared).toHaveLength(1);
    expect(prepared[0].spec.version === 2 && prepared[0].spec.steps).toEqual([quad.selection, before[0].spec.selection]);
    expect(editor.getItems()[1].spec).toEqual(DEFAULT_IMAGE_SPEC); await editor.destroy();
});
it.each(['partial', 'uncertain'] as const)('retains selection and avoids exporting an automatic %s crop', async status => {
    const {host, editor, finish} = await fixture(), before = editor.getItems()[0].spec;
    finish(status === 'partial' ? {status, outline: [{x: 0, y: 0.1}, {x: 0.9, y: 0.1}, {x: 1, y: 1}]}
        : {status, reason: 'ambiguous'});
    await vi.waitFor(() => expect(host.textContent).toContain('已保留当前选区'));
    expect(editor.getItems()[0].spec).toEqual(before);
    expect(await editor.prepare({signal: new AbortController().signal})).toEqual([]);
    const update = vi.mocked(mountCornerEditor).mock.calls.at(-1)![4]; update(quad);
    await editor.apply({signal: new AbortController().signal});
    expect(editor.getItems()[0].spec).toEqual({version: 2, steps: [quad.selection], selection: {kind: 'none'}});
    await editor.destroy();
});
it('finishes releasing owned resources when the corner editor disposer throws', async () => {
    const {editor, processor, finish} = await fixture(); finish({status: 'not-found'});
    await Promise.resolve(); await Promise.resolve();
    const corner = await vi.mocked(mountCornerEditor).mock.results.at(-1)!.value;
    corner.destroy = () => {throw new Error('renderer-cleanup-failed');};
    const signal = vi.mocked(mountCornerEditor).mock.calls.at(-1)![3];
    await expect(editor.destroy()).rejects.toThrow('Image editor cleanup failed');
    expect(signal.aborted).toBe(true); expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(processor.dispose).toBeUndefined();
});
