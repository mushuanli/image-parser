import type {Point, Quad} from '../contracts.js';
import type {PaperPlane} from './channels.js';
import type {Region} from './regions.js';
import {pixelBoundary, polygonArea, quadrilateral, turn} from './geometry.js';
export interface PaperCandidate {corners: Quad; region: Region; score: number; edgeSupport: number; ink: number}
function sample(channel: Uint8Array, x: number, y: number, width: number, height: number): number | null {
    const ix = Math.round(x), iy = Math.round(y); return ix < 0 || iy < 0 || ix >= width || iy >= height ? null : channel[iy * width + ix];
}
function abrupt(feature: Uint8Array, x: number, y: number, nx: number, ny: number, plane: PaperPlane): number {
    let strongest = 0;
    for (const offset of [-2, 0, 2]) {
        const a = sample(feature, x + nx * (offset + 1), y + ny * (offset + 1), plane.width, plane.height);
        const b = sample(feature, x + nx * (offset - 1), y + ny * (offset - 1), plane.width, plane.height);
        if (a !== null && b !== null) strongest = Math.max(strongest, a - b);
    }
    return strongest;
}
export function edge(a: Point, b: Point, region: Pick<Region, 'feature'>, plane: PaperPlane, requireAbrupt = false): number {
    const length = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
    const distance = Math.max(2, Math.min(plane.width, plane.height) * 0.016);
    let valid = 0, positive = 0;
    for (let i = 2; i < 48; i++) {
        const x = a.x + (b.x - a.x) * i / 50, y = a.y + (b.y - a.y) * i / 50;
        const inner = sample(region.feature, x + nx * distance, y + ny * distance, plane.width, plane.height);
        const outer = sample(region.feature, x - nx * distance, y - ny * distance, plane.width, plane.height);
        if (inner !== null && outer !== null) {
            valid++; const delta = inner - outer;
            if (delta > 3 && (!requireAbrupt || abrupt(region.feature, x, y, nx, ny, plane) > Math.max(1, delta * 0.45))) positive++;
        }
    }
    return valid ? positive / valid : 0;
}
export function inkRatio(corners: Quad, plane: PaperPlane): number {
    let count = 0, dark = 0; const values: number[] = [];
    for (let v = 2; v < 28; v++) for (let u = 2; u < 28; u++) {
        const x = (corners[0].x * (30-u) * (30-v) + corners[1].x * u * (30-v) + corners[2].x * u * v + corners[3].x * (30-u) * v) / 900;
        const y = (corners[0].y * (30-u) * (30-v) + corners[1].y * u * (30-v) + corners[2].y * u * v + corners[3].y * (30-u) * v) / 900;
        const value = sample(plane.gray, x, y, plane.width, plane.height); if (value !== null) values.push(value);
    }
    values.sort((a, b) => a - b); const bright = values[Math.floor(values.length * 0.8)] ?? 0;
    for (const value of values) {count++; if (value < bright - 12) dark++;} return count ? dark / count : 0;
}
export function evidence(region: Region, plane: PaperPlane): PaperCandidate | null {
    const corners = quadrilateral(region.outline); if (!corners || region.touches) return null;
    const area = polygonArea(corners); if (area < plane.width * plane.height * 0.01 || area / region.hullArea < 0.985) return null;
    if (!corners.every((p, i) => turn(p, corners[(i + 1) % 4], corners[(i + 2) % 4]) > 4)) return null;
    const support = corners.map((p, i) => edge(p, corners[(i + 1) % 4], region, plane));
    const edgeSupport = Math.min(...support), ink = inkRatio(corners, plane);
    if (edgeSupport < 0.72 || ink < 0.003) return null;
    return {corners: pixelBoundary(corners), region, edgeSupport, ink, score: support.reduce((a, b) => a + b) / 4};
}
export function partialEvidence(region: Region, plane: PaperPlane): boolean {
    if (!region.touches || region.touches > 3 || region.area / (plane.width * plane.height) < 0.05) return false;
    const outline = region.outline; let supported = 0;
    for (let i = 0; i < outline.length; i++) {
        const a = outline[i], b = outline[(i + 1) % outline.length]; if (Math.hypot(a.x - b.x, a.y - b.y) < Math.min(plane.width, plane.height) * 0.08) continue;
        if (edge(a, b, region, plane, true) > 0.7) supported++;
    }
    return supported >= 2;
}

/** Occlusion can weaken one edge; retain the region as evidence against a smaller interior crop. */
export function possiblePaper(region: Region, plane: PaperPlane): Quad | null {
    const corners = quadrilateral(region.outline); if (!corners || region.touches || polygonArea(corners) / region.hullArea < 0.85) return null;
    const support = corners.map((p, i) => edge(p, corners[(i + 1) % 4], region, plane)).sort((a, b) => a - b);
    return support[1] >= 0.8 && inkRatio(corners, plane) >= 0.003 ? corners : null;
}
export function cutsPaper(corners: Quad, possible: readonly Quad[]): boolean {
    return possible.some(outer => polygonArea(outer) > polygonArea(corners) * 1.3
        && corners.every(p => outer.every((a, i) => turn(a, outer[(i + 1) % 4], p) >= -10)));
}
