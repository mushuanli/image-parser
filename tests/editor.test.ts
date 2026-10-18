import {expect, it, vi} from 'vitest';
import {createImageEditor} from '../src/ui';
import {DEFAULT_IMAGE_SPEC, createBlobSource} from '../src/index';
import type {ImageProcessor, ImageSpec} from '../src/contracts';

it('exports images sequentially, returns no partial batch, and leaves borrowed processors alive', async () => {
    const order: string[] = []; let reject = true;
    const processor = {process: vi.fn(async (source: {id: string}, _spec: ImageSpec, opts: {purpose?: string}) => {
        if (opts.purpose === 'preview') throw new Error('No browser decoder in this test');
        order.push(source.id); if (source.id === 'b' && reject) throw new Error('encode-failed');
        return {sourceId: source.id, blob: new Blob(), width: 10, height: 10, mimeType: 'image/png', byteLength: 0, changed: true, purpose: 'export'};
    }), dispose: vi.fn()} as unknown as ImageProcessor;
    const host = document.createElement('div');
    const items = ['a', 'b'].map(id => ({id, revision: 2, original: createBlobSource(new Blob(), {id, revision: '1', name: id}), spec: DEFAULT_IMAGE_SPEC}));
    const editor = createImageEditor(host, {items, processor, resize: {mode: 'max-edge', maxEdge: 1024}});
    const select = host.querySelector('select')!; select.value = '512'; select.dispatchEvent(new Event('change'));
    await expect(editor.prepare({signal: new AbortController().signal})).rejects.toThrow('encode-failed');
    expect(order).toEqual(['a', 'b']); reject = false;
    expect(await editor.prepare({signal: new AbortController().signal})).toHaveLength(2);
    const copied = editor.getItems() as Array<{spec: ImageSpec}>; copied[0].spec = {version: 1, selection: {kind: 'rect', x: 0, y: 0, width: 0.5, height: 0.5}};
    expect(editor.getItems()[0].spec).toEqual(DEFAULT_IMAGE_SPEC);
    await editor.destroy(); expect(host.children).toHaveLength(0); expect(processor.dispose).not.toHaveBeenCalled();
});
