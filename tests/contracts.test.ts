import {describe, expect, it, vi} from 'vitest';
import {createBlobSource, createImageProcessor, DEFAULT_IMAGE_SPEC, fitDimensions, resolveResize, validateSpec} from '../src/index';
import {imageHeader} from '../src/headers';
import {createVfsImageSource} from '../src/vfs';

describe('image policy and normalized geometry', () => {
    it('shrinks only the maximum edge and preserves small images', () => {
        expect(fitDimensions(2400, 1600, resolveResize())).toEqual({width: 1024, height: 683});
        expect(fitDimensions(800, 600, resolveResize())).toEqual({width: 800, height: 600});
        expect(fitDimensions(2400, 1600, {mode: 'original'})).toEqual({width: 2400, height: 1600});
    });
    it('uses explicit session preferences before agent defaults and validates values', () => {
        expect(resolveResize(undefined, {mode: 'max-edge', maxEdge: 2048})).toEqual({mode: 'max-edge', maxEdge: 2048});
        expect(resolveResize({mode: 'original'}, {mode: 'max-edge', maxEdge: 2048})).toEqual({mode: 'original'});
        for (const edge of [0, -1, NaN, Infinity, 0.5, 32769]) expect(() => resolveResize({mode: 'max-edge', maxEdge: edge})).toThrow('invalid-policy');
        expect(() => fitDimensions(0, 10, resolveResize())).toThrow('invalid-policy');
    });
    it('rejects invalid or crossed selections and isolates captured parameters', () => {
        const spec = {version: 1 as const, selection: {kind: 'rect' as const, x: 0.1, y: 0.1, width: 0.8, height: 0.8}};
        const captured = validateSpec(spec); spec.selection.x = 0.2; expect(captured.selection).toMatchObject({x: 0.1});
        expect(() => validateSpec({...spec, selection: {...spec.selection, width: 1}})).toThrow('invalid-selection');
        expect(() => validateSpec({version: 1, selection: {kind: 'quad', points: [{x: 0, y: 0}, {x: 1, y: 1}, {x: 1, y: 0}, {x: 0, y: 1}]}})).toThrow('invalid-selection');
        expect(() => validateSpec({version: 1, selection: {kind: 'quad', points: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}]}})).toThrow();
    });
});
describe('bounded inputs and borrowed resources', () => {
    it('serializes decoding work and skips a cancelled queued read after a failure', async () => {
        const processor = createImageProcessor(), cancel = new AbortController();
        const reads: string[] = []; let release!: () => void;
        const pending = new Promise<void>(resolve => {release = resolve;});
        const first = processor.inspect({id: 'a', revision: '1', name: 'a', read: async () => {
            reads.push('a'); await pending; throw new Error('read-failed');
        }}, {signal: new AbortController().signal}).catch(error => error.message);
        const second = processor.inspect({id: 'b', revision: '1', name: 'b', read: async () => {
            reads.push('b'); return new Blob();
        }}, {signal: cancel.signal}).catch(error => error.message);
        await Promise.resolve(); expect(reads).toEqual(['a']); cancel.abort(); release();
        expect(await first).toBe('read-failed'); expect(await second).toBe('aborted'); expect(reads).toEqual(['a']);
        await expect(processor.inspect(createBlobSource(new Blob(), {id: 'c', revision: '1', name: 'c'}),
            {signal: new AbortController().signal})).rejects.toThrow('unsupported-format');
        await processor.dispose();
    });
    it('rejects size budgets before reading image pixels', async () => {
        const processor = createImageProcessor(), source = createBlobSource(new Blob([new Uint8Array(100)]), {id: 'a', revision: '1', name: 'a.png'});
        await expect(processor.process(source, DEFAULT_IMAGE_SPEC, {signal: new AbortController().signal, limits: {maxInputBytes: 10}})).rejects.toThrow('limit-exceeded');
        await processor.dispose(); await expect(processor.inspect(source, {signal: new AbortController().signal})).rejects.toThrow('disposed');
    });
    it('does not read a cancelled source', async () => {
        let read = false; const processor = createImageProcessor(), abort = new AbortController(); abort.abort();
        await expect(processor.inspect({id: 'a', revision: '1', name: 'a', read: async () => {read = true; return new Blob();}}, {signal: abort.signal})).rejects.toThrow('aborted');
        expect(read).toBe(false);
    });
    it('checks both sides of an authorized VFS read and never closes the filesystem', async () => {
        let reads = 0, revision = '1'; const fs = {driver: {readContent: async () => {reads++; revision = '2'; return new ArrayBuffer(10);}}};
        const source = createVfsImageSource(fs as never, {id: 'a', revision: '1', name: 'a.png', path: '/a.png', getRevision: async () => revision});
        await expect(source.read({signal: new AbortController().signal})).rejects.toThrow('conflict'); expect(reads).toBe(1);
        await expect(source.read({signal: new AbortController().signal})).rejects.toThrow('conflict'); expect(reads).toBe(1);
    });
    it('detects an animated WebP and rejects unsupported file types before decoding', () => {
        const bytes = new Uint8Array(30); bytes.set(new TextEncoder().encode('RIFF'), 0); bytes.set(new TextEncoder().encode('WEBPVP8X'), 8); bytes[20] = 2;
        expect(imageHeader(bytes.buffer)).toMatchObject({mimeType: 'image/webp', animated: true, width: 1, height: 1});
        expect(() => imageHeader(new TextEncoder().encode('<svg/>').buffer)).toThrow('unsupported-format');
    });
});

it('closes a decoded bitmap when candidate detection fails or its processor is disposed', async () => {
    const bytes = new Uint8Array(24); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer); view.setUint32(16, 100); view.setUint32(20, 100);
    const source = createBlobSource(new Blob([bytes]), {id: 'paper', revision: '1', name: 'paper.png'}), close = vi.fn();
    const bitmap = {width: 100, height: 100, close};
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const processor = createImageProcessor({detector: 'paper'});
    try {
        await expect(processor.detect!(source, {signal: new AbortController().signal})).rejects.toThrow('decode-failed');
        expect(close).toHaveBeenCalledOnce(); close.mockClear();
        let decoded!: () => void; const ready = new Promise<void>(resolve => {decoded = resolve;});
        vi.stubGlobal('createImageBitmap', vi.fn(async () => {decoded(); return bitmap;}));
        const pending = processor.detect!(source, {signal: new AbortController().signal});
        await ready; await processor.dispose(); await expect(pending).rejects.toThrow('disposed');
        expect(close).toHaveBeenCalledOnce();
    } finally {await processor.dispose(); context.mockRestore(); vi.unstubAllGlobals();}
});
