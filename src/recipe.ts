import type {ImageSpec, ImageSelection, Point, Quad} from './contracts.js';
import {extent, pixels} from './geometry.js';
import {ImageProcessingError, validateSpec} from './validation.js';

function identity(selection: ImageSelection): boolean {
    if (selection.kind === 'none') return true;
    if (selection.kind === 'rect') return selection.x === 0 && selection.y === 0 && selection.width === 1 && selection.height === 1;
    return selection.points.every((p, i) => p.x === [0, 1, 1, 0][i] && p.y === [0, 0, 1, 1][i]);
}
export function appliedSpec(spec: ImageSpec): ImageSpec {
    const steps = [...(spec.version === 2 ? spec.steps : [])].filter(step => !identity(step));
    if (!identity(spec.selection)) steps.push(spec.selection);
    return steps.length ? validateSpec({version: 2, steps, selection: {kind: 'none'}}) : {version: 1, selection: {kind: 'none'}};
}
export function workingSpec(spec: ImageSpec): ImageSpec {
    return spec.version === 2 ? {...spec, selection: {kind: 'none'}} : {version: 1, selection: {kind: 'none'}};
}
export function withSelection(spec: ImageSpec, selection: ImageSelection): ImageSpec {return validateSpec({...spec, selection});}

/** Map a unit square into a quadrilateral using its projective transform. */
function project(q: Quad): (point: Point) => Point {
    const [a, b, c, d] = q;
    const dx1 = b.x - c.x, dx2 = d.x - c.x, dx3 = a.x - b.x + c.x - d.x;
    const dy1 = b.y - c.y, dy2 = d.y - c.y, dy3 = a.y - b.y + c.y - d.y;
    const determinant = dx1 * dy2 - dx2 * dy1;
    const g = (dx3 * dy2 - dx2 * dy3) / determinant, h = (dx1 * dy3 - dx3 * dy1) / determinant;
    if (![g, h].every(Number.isFinite)) throw new ImageProcessingError('invalid-selection');
    return ({x, y}) => {
        const divisor = g * x + h * y + 1;
        return {x: ((b.x - a.x + g * b.x) * x + (d.x - a.x + h * d.x) * y + a.x) / divisor,
            y: ((b.y - a.y + g * b.y) * x + (d.y - a.y + h * d.y) * y + a.y) / divisor};
    };
}
/** Compose geometry first, then sample the immutable original once. No intermediate JPEGs. */
export function recipeGeometry(spec: ImageSpec, width: number, height: number) {
    let points = pixels({kind: 'none'}, width, height), size = {width, height}, perspective = false;
    const steps = [...(spec.version === 2 ? spec.steps : []), spec.selection].filter(step => !identity(step));
    for (const step of steps) {
        const map = project(points);
        points = pixels(step, 1, 1).map(map) as unknown as Quad;
        if (!points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) throw new ImageProcessingError('invalid-selection');
        size = extent(pixels(step, size.width, size.height));
        perspective ||= step.kind === 'quad';
    }
    return {points, size, perspective, changed: steps.length > 0};
}
