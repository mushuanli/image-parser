import {expect, it, vi} from 'vitest';
import {scanDocument} from 'scanic';
import {detectDocument} from '../src/detection';
import {DEFAULT_IMAGE_LIMITS} from '../src/policy';
vi.mock('scanic', () => ({scanDocument: vi.fn()}));
const image = {image: {} as CanvasImageSource, width: 100, height: 100, close() {}};
const corners = {topLeft: {x: 10, y: 10}, topRight: {x: 90, y: 10}, bottomRight: {x: 90, y: 90}, bottomLeft: {x: 10, y: 90}};
it.each([0.555, NaN, undefined])('retains manual control for a weak or missing classical score: %s', async confidence => {
    vi.mocked(scanDocument).mockResolvedValueOnce({success: true, corners, confidence} as never);
    expect(await detectDocument(image, DEFAULT_IMAGE_LIMITS, new AbortController().signal)).toEqual({status: 'uncertain', reason: 'low-evidence'});
});
it('keeps accepted classical geometry unchanged', async () => {
    vi.mocked(scanDocument).mockResolvedValueOnce({success: true, corners, confidence: 0.9} as never);
    expect(await detectDocument(image, DEFAULT_IMAGE_LIMITS, new AbortController().signal)).toMatchObject({status: 'detected',
        spec: {version: 1, selection: {kind: 'quad', points: [{x: 0.1, y: 0.1}, {x: 0.9, y: 0.1}, {x: 0.9, y: 0.9}, {x: 0.1, y: 0.9}]}}});
});
