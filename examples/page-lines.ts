import type {Point, Quad} from '../src/contracts.js';

interface Line {angle: number; rho: number; votes: number; contrast: number; support: number}
function grayPixels(data: Uint8ClampedArray, width: number, height: number): Float32Array {
    const gray = new Float32Array(width * height), blurred = new Float32Array(gray.length);
    for (let i = 0; i < gray.length; i++) gray[i] = (data[i * 4] * 54 + data[i * 4 + 1] * 183 + data[i * 4 + 2] * 19) / 256;
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        blurred[i] = (gray[i - width - 1] + 2 * gray[i - width] + gray[i - width + 1] + 2 * gray[i - 1] + 4 * gray[i]
            + 2 * gray[i + 1] + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1]) / 16;
    }
    return blurred;
}
function accumulate(gray: Float32Array, width: number, height: number) {
    const radius = Math.ceil(Math.hypot(width, height) / 2), bins = radius * 2 + 1;
    const votes = new Float32Array(180 * bins), cosine = Array.from({length: 180}, (_, a) => Math.cos(a * Math.PI / 180)), sine = cosine.map((_, a) => Math.sin(a * Math.PI / 180));
    for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
        const i = y * width + x, dx = gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1] - gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1];
        const dy = gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1] - gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1];
        const magnitude = Math.hypot(dx, dy); if (magnitude < 60) continue;
        const orientation = (Math.round(Math.atan2(dy, dx) * 180 / Math.PI) + 180) % 180;
        for (let da = -5; da <= 5; da++) {
            const angle = (orientation + da + 180) % 180, rho = Math.round((x * cosine[angle] + y * sine[angle]) / 2) + radius;
            votes[angle * bins + rho] += Math.min(1, magnitude / 160);
        }
    }
    return {votes, radius, bins};
}
function peaks(gray: Float32Array, width: number, height: number): Line[] {
    const {votes, radius, bins} = accumulate(gray, width, height), result: Line[] = [];
    for (let n = 0; n < 120; n++) {
        let best = 0; for (let i = 1; i < votes.length; i++) if (votes[i] > votes[best]) best = i;
        const angle = Math.floor(best / bins), rho = (best % bins - radius) * 2, value = votes[best]; if (value < 15) break;
        result.push({angle: angle * Math.PI / 180, rho, votes: value, contrast: 0, support: 0});
        for (let da = -4; da <= 4; da++) for (let dr = -5; dr <= 5; dr++) {
            const a = angle + da, r = best % bins + dr;
            if (a >= 0 && a < 180 && r >= 0 && r < bins) votes[a * bins + r] = 0;
        }
    }
    return result;
}
function linePoint(line: Line, t: number, width: number, height: number): Point {
    const c = Math.cos(line.angle), s = Math.sin(line.angle);
    return Math.abs(c) > Math.abs(s) ? {x: (line.rho - t * height * s) / c, y: t * height} : {x: t * width, y: (line.rho - t * width * c) / s};
}
function contrast(line: Line, gray: Float32Array, width: number, height: number): void {
    const c = Math.cos(line.angle), s = Math.sin(line.angle), towardCenter = (width / 2 * c + height / 2 * s > line.rho ? 1 : -1);
    let total = 0, count = 0, support = 0;
    for (let n = 0; n < 100; n++) {
        const p = linePoint(line, n / 100, width, height); let delta = 0, valid = true;
        for (const side of [-1, 1]) {
            const x = Math.round(p.x + c * side * towardCenter * 5), y = Math.round(p.y + s * side * towardCenter * 5);
            if (x < 2 || x >= width - 2 || y < 2 || y >= height - 2) {valid = false; break;}
            delta += side * gray[y * width + x];
        }
        if (valid) {total += delta; count++; if (delta > 12) support++;}
    }
    line.contrast = count ? total / count : 0; line.support = support / 100;
}
function detectPageLines(data: Uint8ClampedArray, width: number, height: number): Line[] {
    const gray = grayPixels(data, width, height), lines = peaks(gray, width, height);
    for (const line of lines) contrast(line, gray, width, height);
    return lines.sort((a, b) => b.support - a.support);
}

function intersect(a: Line, b: Line): Point {
    const ca = Math.cos(a.angle), sa = Math.sin(a.angle), cb = Math.cos(b.angle), sb = Math.sin(b.angle);
    const determinant = ca * sb - cb * sa;
    return {x: (a.rho * sb - b.rho * sa) / determinant, y: (ca * b.rho - cb * a.rho) / determinant};
}
function side(line: Line, width: number, height: number): number {
    const p = linePoint(line, 0.5, width, height), vertical = Math.abs(Math.cos(line.angle)) > Math.abs(Math.sin(line.angle));
    return vertical ? (p.x < width / 2 ? 0 : 1) : (p.y < height / 2 ? 2 : 3);
}
/** Experimental centered, light-paper prior. It is not part of the package's production API. */
export function detectPaperBoundary(data: Uint8ClampedArray, width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || Math.max(width, height) > 1024
        || width * height > 600_000 || data.length !== width * height * 4) throw new RangeError('Invalid or excessive detection plane');
    const lines = detectPageLines(data, width, height).filter(line => line.contrast > 8 && line.support >= 0.1);
    const rank = (line: Line) => line.votes * (0.5 + line.support);
    const sides = [0, 1, 2, 3].map(index => lines.filter(line => side(line, width, height) === index).sort((a, b) => rank(b) - rank(a))[0]);
    if (sides.some(line => !line)) return null;
    const [left, right, top, bottom] = sides;
    const corners = [intersect(left, top), intersect(right, top), intersect(right, bottom), intersect(left, bottom)]
        .map(p => ({x: p.x / width, y: p.y / height})) as unknown as Quad;
    if (!corners.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > -0.35 && p.x < 1.35 && p.y > -0.35 && p.y < 1.35)) return null;
    const turns = corners.map((a, i) => {const b = corners[(i + 1) % 4], c = corners[(i + 2) % 4];return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);});
    if (!turns.every(turn => turn > 0.01)) return null;
    return {status: corners.some(p => p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1) ? 'partial' : 'complete', corners,
        lines: sides.map(line => ({angle: line.angle * 180 / Math.PI, rho: line.rho, support: line.support, contrast: line.contrast}))};
}
