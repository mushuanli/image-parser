import {expect, it} from 'vitest';
import {validateSpec} from '../src/validation';
import {detectPaperBoundary} from '../examples/page-lines';
import {geometryMetrics} from '../examples/paper-validation-metrics';
it('rejects out-of-frame estimates in the existing production crop contract', () => {
    const points = [{x: 0.23, y: 0.03}, {x: 1.004, y: 0.09}, {x: 0.91, y: 1.06}, {x: -0.09, y: 0.87}] as const;
    expect(() => validateSpec({version: 1, selection: {kind: 'quad', points}})).toThrow('invalid-selection');
});
it('distinguishes a valid skinny image from the experimental detector plane limits', () => {
    expect(detectPaperBoundary(new Uint8ClampedArray(4 * 800 * 4), 4, 800)).toBeNull();
    expect(() => detectPaperBoundary(new Uint8ClampedArray(4), 800, 800)).toThrow(RangeError);
});
it('does not credit an empty visible target, and matches cyclic corner order without penalizing a rotation', () => {
    const square = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}];
    expect(geometryMetrics([...square.slice(1), square[0]], square, 600, 800).maxCornerError).toBe(0);
    const outside = square.map(p => ({x: p.x + 2, y: p.y + 2}));
    expect(geometryMetrics(square, outside, 600, 800)).toMatchObject({iou: 0, recall: 0, precision: 0});
});
