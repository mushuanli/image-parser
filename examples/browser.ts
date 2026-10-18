import {createImageProcessor, createBlobSource, DEFAULT_IMAGE_SPEC} from '../src/index';
import {createImageEditor} from '../src/ui';
import {mountCornerEditor} from '../src/corner-editor';
import type {ImageSpec} from '../src/index';

const assert = (value: unknown, message: string) => {if (!value) throw new Error(message);};
async function image(width: number, height: number): Promise<Blob> {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, width / 2, height);
    ctx.fillStyle = '#00f'; ctx.fillRect(width / 2, 0, width / 2, height);
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
}
async function documentImage(): Promise<Blob> {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 1000;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 800, 1000);
    ctx.fillStyle = '#fff'; ctx.fillRect(120, 110, 560, 780); ctx.fillStyle = '#222'; ctx.font = '24px sans-serif';
    for (let y = 180; y < 820; y += 55) ctx.fillText('Document scan example', 160, y);
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
}
async function pixel(blob: Blob, x: number, y: number) {
    const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close(); return [...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data];
}
async function waitFor(test: () => boolean) {
    for (let i = 0; i < 100; i++) {if (test()) return; await new Promise(resolve => setTimeout(resolve, 30));}
    throw new Error('Image UI did not become ready');
}
async function checks() {
    const processor = createImageProcessor(), signal = new AbortController().signal, passed: string[] = [];
    const original = await image(2400, 1600), source = createBlobSource(original, {id: 'one', revision: '1', name: 'test.png'});
    const resized = await processor.process(source, DEFAULT_IMAGE_SPEC, {signal});
    assert(resized.width === 1024 && resized.height === 683, 'Default resize dimensions'); passed.push('default 1024 resize');
    assert((await pixel(resized.blob, 900, 100))[2] > 240, 'Resize keeps image content');
    const crop = await processor.process(source, {version: 1, selection: {kind: 'rect', x: 0.5, y: 0, width: 0.5, height: 1}}, {signal});
    assert((await pixel(crop.blob, 20, 20))[2] > 240, 'Crop selects the right half'); passed.push('rectangle crop pixels');
    const quad = await processor.process(source, {version: 1, selection: {kind: 'quad', points: [{x: 0.55, y: 0.1}, {x: 0.95, y: 0.05}, {x: 0.95, y: 0.95}, {x: 0.55, y: 0.9}]}}, {signal});
    assert(quad.width <= 1024 && quad.height <= 1024 && (await pixel(quad.blob, 20, 20))[2] > 240, 'Quad extracts blue document'); passed.push('Scanic perspective pixels');
    const restored = await processor.process(source, DEFAULT_IMAGE_SPEC, {signal, resize: {mode: 'original'}});
    assert(restored.blob === original && !restored.changed, 'Original bytes are retained'); passed.push('original byte identity');
    const small = await image(200, 100), second = createBlobSource(small, {id: 'two', revision: '1', name: 'small.png'});
    const unchanged = await processor.process(second, DEFAULT_IMAGE_SPEC, {signal});
    assert(unchanged.blob === small && unchanged.width === 200, 'Small image not enlarged'); passed.push('small image passthrough');
    const host = document.querySelector<HTMLElement>('#editor')!;
    const editor = createImageEditor(host, {processor, locale: 'zh-CN', items: [
        {id: 'one', revision: 2, original: source, spec: DEFAULT_IMAGE_SPEC}, {id: 'two', revision: 3, original: second, spec: DEFAULT_IMAGE_SPEC},
    ]});
    await waitFor(() => !!host.querySelector('.image-editor__surface img'));
    host.querySelector<HTMLButtonElement>('[data-tool=rect]')!.click();
    await waitFor(() => !!host.querySelector('.image-editor__rect'));
    assert(editor.getItems()[0].spec.selection.kind === 'rect', 'Crop parameters updated');
    await editor.activate('two'); await editor.activate('one');
    assert(editor.getItems()[0].spec.selection.kind === 'rect', 'Switch retains parameters'); passed.push('multi-image parameter retention');
    host.querySelector<HTMLButtonElement>('[data-tool=none]')!.click();
    await waitFor(() => !host.querySelector('.image-editor__rect'));
    assert(editor.getItems()[0].spec.selection.kind === 'rect', 'Preview must not restore the crop'); passed.push('preview keeps edit');
    const prepared = await editor.prepare({signal}); assert(prepared.length === 1 && prepared[0].expectedRevision === 2, 'Only changed image exported');
    editor.restoreOriginal(); await waitFor(() => editor.getItems()[0].spec.selection.kind === 'none'); passed.push('restore current image');
    await editor.destroy(); assert(!host.children.length, 'Panel releases DOM');
    const paper = createBlobSource(await documentImage(), {id: 'paper', revision: '1', name: 'document.png'});
    const fetch = globalThis.fetch; globalThis.fetch = async () => {throw new Error('Detector must work offline');};
    try {
        const detected = await processor.detect!(paper, {signal});
        assert(detected.status === 'detected' && detected.spec.selection.kind === 'quad', 'Classical document detection succeeds');
        if (detected.status === 'detected' && detected.spec.selection.kind === 'quad') {
            assert(Math.abs(detected.spec.selection.points[0].x - 0.15) < 0.04 && Math.abs(detected.spec.selection.points[0].y - 0.11) < 0.04, 'Corners map to normalized original coordinates');
        }
        const {scanDocument} = await import('scanic'), bitmap = await createImageBitmap(await paper.read({signal}));
        try {
            const reference = await scanDocument(bitmap, {mode: 'detect'});
            const expected = [reference.corners!.topLeft, reference.corners!.topRight, reference.corners!.bottomRight, reference.corners!.bottomLeft]
                .map(point => ({x: point.x / bitmap.width, y: point.y / bitmap.height}));
            assert(detected.status === 'detected' && detected.spec.selection.kind === 'quad' && JSON.stringify(detected.spec.selection.points) === JSON.stringify(expected), 'Classical detection matches the demo default call');
        } finally {bitmap.close();}
        passed.push('offline classical document detection');
    } finally {globalThis.fetch = fetch;}
    const scanner = createImageEditor(host, {processor, locale: 'zh-CN', items: [{id: 'paper', revision: 0, original: paper, spec: DEFAULT_IMAGE_SPEC}]});
    await waitFor(() => !!host.querySelector('.image-editor__surface img'));
    host.querySelector<HTMLButtonElement>('[data-tool=quad]')!.click();
    const scanned = await scanner.prepare({signal});
    assert(scanned.length === 1 && scanned[0].spec.version === 2 && scanned[0].spec.steps[0].kind === 'quad', 'Apply waits for automatic detection');
    assert(host.querySelector('.image-editor__status')!.textContent!.includes('已识别边界'), 'Automatic scan shows detected result');
    await scanner.destroy(); passed.push('automatic scan UI and apply synchronization');
    const continuous = createImageEditor(host, {processor, locale: 'zh-CN', resize: {mode: 'original'}, items: [{id: 'one', revision: 4, original: source,
        spec: {version: 1, selection: {kind: 'quad', points: [{x: 0.25, y: 0}, {x: 0.75, y: 0}, {x: 0.75, y: 1}, {x: 0.25, y: 1}]}}}]});
    await waitFor(() => !!host.querySelector('.image-editor__surface img'));
    host.querySelector<HTMLButtonElement>('[data-tool=rect]')!.click(); await waitFor(() => !!host.querySelector('.image-editor__rect'));
    await continuous.apply({signal});
    assert(!host.querySelector('.image-editor__rect') && continuous.getItems()[0].spec.version === 2, 'Apply updates the working plane and removes old handles');
    host.querySelector<HTMLButtonElement>('[data-tool=rect]')!.click(); await waitFor(() => !!host.querySelector('.image-editor__rect'));
    await continuous.apply({signal});
    const combined = (await continuous.prepare({signal}))[0];
    assert(combined.spec.version === 2 && combined.spec.steps.length === 3, 'Two applies preserve the scan and both crops');
    assert(combined.output.width < 1200 && combined.output.height < 1600, 'Each crop uses the previous working plane');
    await continuous.activate('one'); assert(!host.querySelector('.image-editor__rect'), 'Applied operations stay applied after reactivation');
    continuous.restoreOriginal(); await waitFor(() => continuous.getItems()[0].spec.version === 1);
    const reset = await continuous.prepare({signal}); assert(reset[0].output.blob === original, 'Restore returns the immutable original bytes');
    await continuous.destroy(); passed.push('continuous scan crop apply and restore');
    const chain: ImageSpec = {version: 2, steps: [{kind: 'quad', points: [{x: 0.25, y: 0}, {x: 0.75, y: 0}, {x: 0.75, y: 1}, {x: 0.25, y: 1}]},
        {kind: 'rect', x: 0.5, y: 0, width: 0.5, height: 1}], selection: {kind: 'rect', x: 0, y: 0, width: 1, height: 0.5}};
    const chained = await processor.process(source, chain, {signal, resize: {mode: 'original'}});
    assert(chained.width === 600 && chained.height === 800 && (await pixel(chained.blob, 50, 50))[2] > 240, 'Composed scan and crops select blue pixels at original quality');
    const reopened = createImageEditor(host, {processor, items: [{id: 'one', revision: 5, original: source, spec: chain}]});
    await waitFor(() => !!host.querySelector('.image-editor__surface img'));
    assert(reopened.getItems()[0].spec.version === 2 && reopened.getItems()[0].spec.selection.kind === 'none', 'Reopening shows committed geometry');
    await reopened.destroy(); passed.push('composed geometry pixels and reopening');
    const cornerImage = new Image(); cornerImage.src = URL.createObjectURL(await image(1000, 500)); await cornerImage.decode();
    cornerImage.width = 100; cornerImage.height = 50;
    const cornerSpec: ImageSpec = {version: 1, selection: {kind: 'quad', points: [{x: 0.1, y: 0.1}, {x: 0.9, y: 0.1}, {x: 0.9, y: 0.9}, {x: 0.1, y: 0.9}]}};
    let mapped: ImageSpec | undefined;
    const corners = await mountCornerEditor(host, cornerImage, cornerSpec, signal, value => {mapped = value;});
    assert(JSON.stringify(mapped) === JSON.stringify(cornerSpec), 'CSS image sizing never changes normalized corners');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const handles = [...host.querySelectorAll<HTMLElement>('.scanic-handle')];
    const cornerCanvas = host.querySelector('canvas')!;
    const spread = Math.max(...handles.map(h => parseFloat(h.style.left))) - Math.min(...handles.map(h => parseFloat(h.style.left)));
    assert(Math.abs(spread - (parseFloat(cornerCanvas.style.width) - 24) * 0.8) < 2, 'Visible corners use the full pixel plane rather than the CSS image size');
    corners.destroy(); URL.revokeObjectURL(cornerImage.src); passed.push('CSS independent corner coordinates');
    await processor.dispose(); return passed;
}
Object.assign(window, {runImageChecks: checks});
