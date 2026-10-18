import type {ImageSelection, Point, Quad} from './contracts.js';
export interface Rectangle {x: number; y: number; width: number; height: number}
export function pixels(selection: ImageSelection, width: number, height: number): Quad {
    const points: Quad = selection.kind === 'quad' ? selection.points : selection.kind === 'rect'
        ? [{x: selection.x, y: selection.y}, {x: selection.x + selection.width, y: selection.y},
            {x: selection.x + selection.width, y: selection.y + selection.height}, {x: selection.x, y: selection.y + selection.height}]
        : [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}];
    return points.map(p => ({x: p.x * width, y: p.y * height})) as unknown as Quad;
}
export function extent(points: Quad): {width: number; height: number} {
    const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    return {width: Math.max(1, Math.round(Math.max(distance(points[0], points[1]), distance(points[3], points[2])))),
        height: Math.max(1, Math.round(Math.max(distance(points[0], points[3]), distance(points[1], points[2]))))};
}
export function bounds(points: Quad): Rectangle {
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    return {x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y};
}
