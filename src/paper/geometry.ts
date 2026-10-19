import type {Point, Quad} from '../contracts.js';
export const turn = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export function polygonArea(points: readonly Point[]): number {
    return Math.abs(points.reduce((sum, p, i) => {const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y;}, 0)) / 2;
}
export function hull(input: Point[]): Point[] {
    const sorted = input.sort((a, b) => a.x - b.x || a.y - b.y), lower: Point[] = [], upper: Point[] = [];
    for (const point of sorted) {while (lower.length > 1 && turn(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop(); lower.push(point);}
    for (const point of sorted.slice().reverse()) {while (upper.length > 1 && turn(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop(); upper.push(point);}
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
export function quadrilateral(points: readonly Point[]): Quad | null {
    const q = [...points]; if (q.length < 4) return null;
    while (q.length > 4) {
        let index = 0, cost = Infinity;
        for (let i = 0; i < q.length; i++) {const delta = Math.abs(turn(q[(i + q.length - 1) % q.length], q[i], q[(i + 1) % q.length])); if (delta < cost) {cost = delta; index = i;}}
        q.splice(index, 1);
    }
    const first = q.reduce((best, point, i) => point.x + point.y < q[best].x + q[best].y ? i : best, 0);
    return [...q.slice(first), ...q.slice(0, first)] as unknown as Quad;
}
export function normalize(points: readonly Point[], width: number, height: number): Point[] {
    return points.map(p => ({x: p.x / width, y: p.y / height}));
}

/** Recover pixel boundaries from foreground pixel centers without extrapolating missing edges. */
export function pixelBoundary(points: Quad): Quad {
    const lines = points.map((p, i) => {const q = points[(i + 1) % 4], length = Math.hypot(q.x - p.x, q.y - p.y);
        const nx = (q.y - p.y) / length, ny = -(q.x - p.x) / length; return {nx, ny, rho: nx * p.x + ny * p.y + 0.5};});
    return lines.map((b, i) => {const a = lines[(i + 3) % 4], det = a.nx * b.ny - b.nx * a.ny;
        return {x: (a.rho * b.ny - b.rho * a.ny) / det, y: (a.nx * b.rho - b.nx * a.rho) / det};}) as unknown as Quad;
}

export function visible(points: readonly Point[]): readonly Point[] {
    let polygon = [...points];
    for (const [axis, bound, sign] of [['x', 0, 1], ['x', 1, -1], ['y', 0, 1], ['y', 1, -1]] as const) {
        const output: Point[] = [];
        polygon.forEach((p, i) => {const q = polygon[(i + 1) % polygon.length], a = sign * (p[axis] - bound), b = sign * (q[axis] - bound);
            if (a >= 0) output.push(p);
            if ((a >= 0) !== (b >= 0)) {const t = a / (a - b); output.push({x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y)});}
        }); polygon = output;
    }
    return polygon;
}
