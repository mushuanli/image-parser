import type {Point} from '../contracts.js';
import {hull, polygonArea} from './geometry.js';
export interface Region {area: number; outline: Point[]; hullArea: number; touches: number; feature: Uint8Array; threshold: number}
interface Fill {visited: Uint8Array; queue: Int32Array; feature: Uint8Array; threshold: number; width: number; height: number}
function visit(index: number, fill: Fill, tail: number): number {
    if (!fill.visited[index]) {fill.visited[index] = 1; fill.queue[tail++] = index;}
    return tail;
}
function adjacent(index: number, x: number, y: number, tail: number, fill: Fill): number {
    if (x) tail = visit(index - 1, fill, tail);
    if (x + 1 < fill.width) tail = visit(index + 1, fill, tail);
    if (y) tail = visit(index - fill.width, fill, tail);
    if (y + 1 < fill.height) tail = visit(index + fill.width, fill, tail);
    return tail;
}
function* component(start: number, fill: Fill): Generator<void, Region | null> {
    const {width, height, queue, visited, feature, threshold} = fill;
    let head = 0, tail = 1, minX = width, maxX = 0, minY = height, maxY = 0;
    queue[0] = start; visited[start] = 1;
    while (head < tail) {
        if (head && head % 8192 === 0) yield;
        const i = queue[head++], x = i % width, y = Math.floor(i / width);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        tail = adjacent(i, x, y, tail, fill);
    }
    if (tail < width * height * 0.008) return null;
    const left = new Int32Array(height).fill(width), right = new Int32Array(height).fill(-1);
    for (let j = 0; j < tail; j++) {if (j % 8192 === 0) yield; const x = queue[j] % width, y = Math.floor(queue[j] / width); left[y] = Math.min(left[y], x); right[y] = Math.max(right[y], x);}
    const boundary: Point[] = [];
    for (let y = minY; y <= maxY; y++) if (right[y] >= 0) boundary.push({x: left[y], y}, {x: right[y], y});
    const outline = hull(boundary), hullArea = polygonArea(outline);
    const touches = Number(minX <= 1) + Number(minY <= 1) + Number(maxX >= width - 2) + Number(maxY >= height - 2);
    return {area: tail, outline, hullArea, touches, feature, threshold};
}
export function* regionSteps(feature: Uint8Array, threshold: number, width: number, height: number): Generator<void, Region[]> {
    const fill = {feature, threshold, width, height, queue: new Int32Array(feature.length), visited: new Uint8Array(feature.length)};
    for (let i = 0; i < feature.length; i++) {fill.visited[i] = Number(feature[i] <= threshold); if (i % 8192 === 0) yield;}
    const output: Region[] = [];
    for (let i = 0; i < feature.length; i++) {
        if (i % 8192 === 0) yield;
        if (!fill.visited[i]) {
            const region = yield* component(i, fill); if (region && region.touches < 4 && region.hullArea > 0) output.push(region);
        }
    }
    return output;
}

export function regions(feature: Uint8Array, threshold: number, width: number, height: number): Region[] {
    const steps = regionSteps(feature, threshold, width, height); let result = steps.next();
    while (!result.done) result = steps.next(); return result.value;
}
