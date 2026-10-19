import {expect, it, vi} from 'vitest';
import {detectPaperAsync} from '../src/paper/run';
import {detectPaperBoundary} from '../src/paper/detect';
import {peakHeap, popPeak} from '../src/paper/heap';
function texturedPlane(): Uint8ClampedArray {
    const data = new Uint8ClampedArray(320 * 400 * 4); let seed = 71;
    for (let i = 0; i < data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = seed & 255; data[i + 1] = seed >>> 8 & 255; data[i + 2] = seed >>> 16 & 255; data[i + 3] = 255;
    }
    return data;
}
it('yields to cancellation during detection and does not publish a late result', async () => {
    const controller = new AbortController(), promise = detectPaperAsync(texturedPlane(), 320, 400, controller.signal);
    setTimeout(() => controller.abort(), 0);
    await expect(promise).rejects.toThrow('aborted');
});
it('checks processor lifetime after yielding and agrees with the synchronous audit', async () => {
    const data = texturedPlane(), signal = new AbortController().signal;
    expect(await detectPaperAsync(data, 320, 400, signal)).toEqual(detectPaperBoundary(data, 320, 400));
    let closed = false; const pending = detectPaperAsync(data, 320, 400, signal, () => {if (closed) throw new Error('disposed');});
    setTimeout(() => {closed = true;}, 0); await expect(pending).rejects.toThrow('disposed');
});
it('returns uncertainty on a computation budget overrun', async () => {
    const time = vi.spyOn(performance, 'now'); let now = 0; time.mockImplementation(() => now += 2100);
    try {expect(await detectPaperAsync(texturedPlane(), 320, 400, new AbortController().signal)).toEqual({status: 'uncertain', reason: 'budget-exceeded'});}
    finally {time.mockRestore();}
});
it('preserves exhaustive Hough peak ordering, including equal votes and suppressed entries', () => {
    const scores = Float32Array.from({length: 1200}, (_, i) => (i * 7919 % 337) / 3);
    const build = peakHeap(scores); let next = build.next(); while (!next.done) next = build.next();
    for (let n = 0; n < 120; n++) {
        let expected = 0; for (let i = 1; i < scores.length; i++) if (scores[i] > scores[expected]) expected = i;
        let actual = popPeak(next.value); while (actual !== undefined && !scores[actual]) actual = popPeak(next.value);
        expect(actual).toBe(expected);
        for (let i = Math.max(0, expected - 2); i <= Math.min(scores.length - 1, expected + 2); i++) scores[i] = 0;
    }
});
