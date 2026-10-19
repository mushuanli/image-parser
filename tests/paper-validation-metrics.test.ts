import {expect, it} from 'vitest';
import {geometryMetrics, assess} from '../examples/paper-validation-metrics';
const square = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}];
it('measures missing paper independently from extra background and clips to the visible frame', () => {
    const half = square.map(p => ({...p, x: p.x / 2})), metrics = geometryMetrics(half, square, 600, 800);
    expect(metrics).toMatchObject({iou: 0.5, recall: 0.5, precision: 1});
    expect(assess({expected: 'complete', status: 'complete', metrics})).toEqual({passed: false, unsafeComplete: true});
    const outside = [{x: -1, y: -1}, {x: 2, y: -1}, {x: 2, y: 2}, {x: -1, y: 2}];
    expect(geometryMetrics(outside, square, 600, 800)).toMatchObject({iou: 1, recall: 1, precision: 1});
});
it('does not count an incorrect complete result, a missed document or a negative false positive as accepted', () => {
    const exact = geometryMetrics(square, square, 600, 800);
    expect(assess({expected: 'partial', status: 'complete', metrics: exact})).toEqual({passed: false, unsafeComplete: true});
    expect(assess({expected: 'complete', status: 'not-found'}).passed).toBe(false);
    expect(assess({expected: 'abstain', status: 'complete'}).unsafeComplete).toBe(true);
    expect(assess({expected: 'abstain', status: 'not-found'}).passed).toBe(true);
    expect(assess({expected: 'partial', status: 'partial'}).passed).toBe(true);
});
