import type {ImageSelection, ImageSpec, Point, Quad} from './contracts.js';
export type ImageErrorCode = 'unsupported-format' | 'decode-failed' | 'invalid-selection' | 'invalid-policy'
    | 'limit-exceeded' | 'encode-failed' | 'aborted' | 'disposed' | 'conflict';
export class ImageProcessingError extends Error {
    constructor(readonly code: ImageErrorCode, options?: ErrorOptions) {super(code, options); this.name = 'ImageProcessingError';}
}
export function check(signal: AbortSignal): void {if (signal.aborted) throw new ImageProcessingError('aborted');}
function point(p: Point): boolean {return !!p && [p.x, p.y].every(v => Number.isFinite(v) && v >= 0 && v <= 1);}
function cross(a: Point, b: Point, c: Point): number {return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);}
export function validateSpec(spec: ImageSpec): ImageSpec {
    const s = spec?.selection;
    if (![1, 2].includes(spec?.version) || !validSelection(s)
        || (spec.version === 2 && (!Array.isArray(spec.steps) || spec.steps.length > 100 || !spec.steps.every(validSelection)))) throw new ImageProcessingError('invalid-selection');
    return structuredClone(spec);
}
function validSelection(s: ImageSelection): boolean {
    if (s?.kind === 'none') return true;
    if (s?.kind === 'rect') return point(s) && Number.isFinite(s.width) && Number.isFinite(s.height)
        && s.width > 0 && s.height > 0 && s.x + s.width <= 1 && s.y + s.height <= 1;
    if (s?.kind !== 'quad' || !Array.isArray(s.points) || s.points.length !== 4 || !s.points.every(point)) return false;
    return validQuad(s.points);
}
function validQuad(q: Quad): boolean {
    const turns = q.map((a, i) => cross(a, q[(i + 1) % 4], q[(i + 2) % 4]));
    return turns.every(v => v > 0.000001);
}
