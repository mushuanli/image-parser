import type * as API from '../src/index';
import {createImageEditor} from '../src/ui';
import {syntheticCases} from './paper-validation-cases';
const assert = (value: unknown, message: string) => {if (!value) throw new Error(message);};
async function blob(image: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => image.toBlob(value => value ? resolve(value) : reject(new Error('encoding failed')), 'image/png'));
}
async function waitFor(test: () => boolean) {
    for (let i = 0; i < 100; i++) {if (test()) return; await new Promise(resolve => setTimeout(resolve, 20));}
    throw new Error('Editor readiness timeout');
}
export async function runRuntimeChecks(api: typeof API, manifestUrl?: string | null) {
    const processor = api.createImageProcessor({detector: 'paper'}), signal = new AbortController().signal;
    const cases = syntheticCases(), records: {id: string; status: string}[] = [];
    const ids = ['centered-text', 'very-low-contrast', 'position-0.2-0.25', 'partial-0.2-0.5', 'multiple-pages', 'gradient-only', 'blank-white', 'curved-top'];
    let partial: API.ImageSource | undefined, beat = performance.now(), longestHeartbeatGap = 0, beats = 0;
    const timer = setInterval(() => {const now = performance.now(); longestHeartbeatGap = Math.max(longestHeartbeatGap, now - beat); beat = now; beats++;}, 5);
    try {
        for (const test of cases.filter(item => ids.includes(item.id))) {
            const source = api.createBlobSource(await blob(test.image), {id: test.id, revision: '1', name: `${test.id}.png`});
            const fetch = globalThis.fetch; globalThis.fetch = async () => {throw new Error('Detection must work offline');};
            let result: API.ImageDetection;
            try {result = await processor.detect!(source, {signal});} finally {globalThis.fetch = fetch;}
            if (test.expected === 'complete') assert(result.status === 'detected', `${test.id} should detect a complete page`);
            if (test.expected === 'partial') {assert(result.status === 'partial', `${test.id} should be partial`); partial = source;}
            if (test.expected === 'abstain') assert(result.status === 'not-found' || result.status === 'uncertain', `${test.id} should abstain`);
            if (result.status === 'detected') api.validateSpec(result.spec);
            if (result.status === 'partial') assert(!('spec' in result) && result.outline.length >= 3
                && result.outline.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1), 'Partial outline cannot be a crop');
            records.push({id: test.id, status: result.status});
        }
        if (manifestUrl) {
            const manifest = await (await fetch(manifestUrl)).json();
            const user = manifest.images?.find((item: {id: string}) => item.id === 'user-a.jpg');
            if (user) {const image = await (await fetch(user.url)).blob(), source = api.createBlobSource(image, {id: user.id, revision: '1', name: user.id});
                const result = await processor.detect!(source, {signal}); assert(result.status === 'partial', 'User photo must not produce an interior crop');
                records.push({id: user.id, status: result.status});}
        }
        assert(beats > 0, 'The detector yields to the browser event loop');
        await partialEditor(processor, partial!, signal); records.push({id: 'partial editor apply and finish', status: 'passed'});
        return {passed: true, offline: true, records, heartbeat: {beats, longestGapMilliseconds: longestHeartbeatGap}, userAgent: navigator.userAgent};
    } finally {clearInterval(timer); for (const test of cases) test.image.width = test.image.height = 0; await processor.dispose();}
}
async function partialEditor(processor: API.ImageProcessor, original: API.ImageSource, signal: AbortSignal) {
    const host = document.createElement('div'); document.body.append(host);
    const editor = createImageEditor(host, {processor, locale: 'zh-CN', resize: {mode: 'original'}, items: [
        {id: original.id, revision: 0, original, spec: {version: 1, selection: {kind: 'none'}}},
    ]});
    try {
        await waitFor(() => !!host.querySelector('.image-editor__surface'));
        host.querySelector<HTMLButtonElement>('[data-tool=quad]')!.click();
        const prepared = await editor.prepare({signal});
        assert(host.textContent!.includes('已保留当前选区'), 'Partial editor explains manual adjustment');
        assert(prepared.length === 0, 'Finishing an untouched partial result does not export a crop');
        await editor.apply({signal});
        assert(editor.getItems()[0].spec.selection.kind === 'none', 'Applying an untouched full frame adds no geometric step');
    } finally {await editor.destroy(); host.remove();}
}
