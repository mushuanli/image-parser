import type {Point, Quad} from '../src/contracts.js';
const cross = (a: Point, b: Point, p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
const frame: Quad = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}];
export function area(points: readonly Point[]): number {
    return Math.abs(points.reduce((sum, p, i) => {const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y;}, 0)) / 2;
}
/** Exact convex-polygon clipping avoids raster-size-dependent acceptance metrics. */
export function clip(subject: readonly Point[], boundary: readonly Point[]): Point[] {
    let output = [...subject];
    for (const [i, a] of boundary.entries()) {
        const b = boundary[(i + 1) % boundary.length], input = output; output = [];
        for (const [j, end] of input.entries()) {
            const start = input[(j + input.length - 1) % input.length], ds = cross(a, b, start), de = cross(a, b, end);
            if ((ds >= 0) !== (de >= 0)) {
                const t = ds / (ds - de); output.push({x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y)});
            }
            if (de >= 0) output.push(end);
        }
    }
    return output;
}
export function geometryMetrics(predicted: readonly Point[], truth: readonly Point[], width: number, height: number) {
    const target = clip(truth, frame), found = clip(predicted, frame), intersection = target.length >= 3 ? area(clip(found, target)) : 0;
    const targetArea = area(target), foundArea = area(found), union = targetArea + foundArea - intersection;
    const errors = [0, 1, 2, 3].map(offset => Math.max(...predicted.map((point, i) => {
        const expected = truth[(i + offset) % 4]; return Math.hypot((point.x - expected.x) * width, (point.y - expected.y) * height) / Math.hypot(width, height);
    })));
    return {iou: union ? intersection / union : 0, recall: targetArea ? intersection / targetArea : 0,
        precision: foundArea ? intersection / foundArea : 0, maxCornerError: Math.min(...errors)};
}
export interface Measured {expected: 'complete' | 'partial' | 'abstain'; status: string; metrics?: ReturnType<typeof geometryMetrics>}
export function assess(record: Measured) {
    const precise = !!record.metrics && record.metrics.iou >= 0.9 && record.metrics.recall >= 0.97 && record.metrics.maxCornerError <= 0.03;
    const passed = record.expected === 'complete' ? record.status === 'complete' && precise
        : record.expected === 'partial' ? record.status === 'partial' : record.status === 'not-found';
    const unsafeComplete = record.status === 'complete' && (record.expected !== 'complete' || !!record.metrics && record.metrics.recall < 0.97);
    return {passed, unsafeComplete};
}
