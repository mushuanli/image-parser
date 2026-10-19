import type {Point} from '../src/contracts.js';
export interface ValidationCase {id: string; category: string; expected: 'complete' | 'partial' | 'abstain';
    points: readonly Point[] | null; image: HTMLCanvasElement}
interface Page {id: string; category?: string; x?: number; y?: number; w?: number; h?: number; angle?: number;
    background?: number; paper?: number; pattern?: string; noise?: number; shadow?: boolean; curved?: boolean;
    expected?: ValidationCase['expected']; width?: number; height?: number}
function path(g: CanvasRenderingContext2D, q: readonly Point[], w: number, h: number, curved = false): void {
    g.beginPath(); g.moveTo(q[0].x * w, q[0].y * h);
    if (curved) g.quadraticCurveTo(w / 2, q[0].y * h + 70, q[1].x * w, q[1].y * h); else g.lineTo(q[1].x * w, q[1].y * h);
    for (const p of q.slice(2)) g.lineTo(p.x * w, p.y * h); g.closePath();
}
function geometry(p: Page, width: number, height: number): Point[] {
    const x = p.x ?? 0.5, y = p.y ?? 0.5, w = p.w ?? 0.62, h = p.h ?? 0.76, radians = (p.angle ?? 0) * Math.PI / 180;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
        const dx = sx * w * width / 2, dy = sy * h * height / 2;
        return {x: x + (dx * Math.cos(radians) - dy * Math.sin(radians)) / width,
            y: y + (dx * Math.sin(radians) + dy * Math.cos(radians)) / height};
    });
}
function background(g: CanvasRenderingContext2D, width: number, height: number, p: Page): void {
    const shade = p.background ?? 35; g.fillStyle = `rgb(${shade},${shade},${shade})`; g.fillRect(0, 0, width, height);
    if (p.pattern === 'grid' || p.pattern === 'stripes') {
        g.strokeStyle = '#777'; g.lineWidth = 2;
        for (let x = 10; x < width; x += 25) {g.beginPath(); g.moveTo(x, 0); g.lineTo(x, height); g.stroke();}
        if (p.pattern === 'grid') for (let y = 10; y < height; y += 25) {g.beginPath(); g.moveTo(0, y); g.lineTo(width, y); g.stroke();}
    }
    if (p.pattern === 'gradient') {const fill = g.createLinearGradient(0, 0, width, height); fill.addColorStop(0, '#222'); fill.addColorStop(1, '#eee'); g.fillStyle = fill; g.fillRect(0, 0, width, height);}
    if (p.pattern === 'clutter') {
        g.fillStyle = '#ccc'; g.fillRect(width * 0.02, height * 0.03, width * 0.2, height * 0.2);
        g.fillStyle = '#191919'; g.fillRect(width * 0.7, height * 0.65, width * 0.25, height * 0.3);
        g.strokeStyle = '#888'; g.lineWidth = 8; g.beginPath(); g.moveTo(0, height * 0.8); g.lineTo(width, height * 0.2); g.stroke();
    }
}
function drawPaper(g: CanvasRenderingContext2D, points: readonly Point[], width: number, height: number, p: Page): void {
    g.save(); path(g, points, width, height, p.curved); g.clip();
    const shade = p.paper ?? 220; g.fillStyle = `rgb(${shade},${shade},${shade})`; g.fillRect(0, 0, width, height);
    if (p.shadow) {const fill = g.createLinearGradient(0, 0, width, 0); fill.addColorStop(0, '#777'); fill.addColorStop(1, '#ddd'); g.fillStyle = fill; g.fillRect(0, 0, width, height);}
    const left = Math.min(...points.map(q => q.x)) * width, top = Math.min(...points.map(q => q.y)) * height;
    g.fillStyle = shade < 100 ? '#ddd' : '#222'; g.font = '14px sans-serif';
    for (let i = 1; i <= 18; i++) g.fillText(`Document ${i} content, characters and lines`, left + 16, top + 30 + i * 27);
    g.restore();
}
function noise(g: CanvasRenderingContext2D, width: number, height: number, strength: number): void {
    const pixels = g.getImageData(0, 0, width, height); let seed = 417;
    for (let i = 0; i < pixels.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const delta = ((seed / 4294967296) * 2 - 1) * strength;
        for (let c = 0; c < 3; c++) pixels.data[i + c] += delta;
    }
    g.putImageData(pixels, 0, 0);
}
function page(p: Page): ValidationCase {
    const image = document.createElement('canvas'); image.width = p.width ?? 600; image.height = p.height ?? 800;
    const g = image.getContext('2d')!, points = geometry(p, image.width, image.height);
    background(g, image.width, image.height, p); drawPaper(g, points, image.width, image.height, p);
    if (p.noise) noise(g, image.width, image.height, p.noise);
    const expected = p.expected ?? (points.some(q => q.x < 0 || q.x > 1 || q.y < 0 || q.y > 1) ? 'partial' : 'complete');
    return {id: p.id, category: p.category ?? 'appearance', expected, points: p.curved ? null : points, image};
}
function negative(id: string, pattern: string, shade = 160): ValidationCase {
    const image = document.createElement('canvas'); image.width = 600; image.height = 800;
    background(image.getContext('2d')!, 600, 800, {id, pattern, background: shade});
    return {id, category: 'negative', expected: 'abstain', points: null, image};
}
export function syntheticCases(): ValidationCase[] {
    const cases = [page({id: 'centered-text'}), page({id: 'low-contrast', background: 180, paper: 210}),
        page({id: 'very-low-contrast', background: 185, paper: 193}), page({id: 'shadow', shadow: true}),
        page({id: 'noise-10', noise: 10}), page({id: 'noise-25', noise: 25}), page({id: 'grid-background', pattern: 'grid'}),
        page({id: 'striped-background', pattern: 'stripes'}), page({id: 'cluttered-background', pattern: 'clutter'}),
        page({id: 'gradient-background', pattern: 'gradient'})];
    for (const angle of [-60, -45, -25, -10, 10, 25, 45, 60, 90]) cases.push(page({id: `rotation-${angle}`, category: 'rotation', angle, w: 0.5, h: 0.58}));
    for (const x of [0.2, 0.5, 0.8]) for (const y of [0.25, 0.5, 0.75]) cases.push(page({id: `position-${x}-${y}`, category: 'position', x, y, w: 0.32, h: 0.4}));
    for (const w of [0.15, 0.3, 0.5, 0.9]) cases.push(page({id: `scale-${w}`, category: 'scale', w, h: w}));
    for (const [x, y] of [[0.2, 0.5], [0.8, 0.5], [0.5, 0.25], [0.5, 0.75], [0.15, 0.2], [0.85, 0.8]]) cases.push(page({id: `partial-${x}-${y}`, category: 'partial', x, y, w: 0.8, h: 0.8}));
    cases.push(page({id: 'small-plane-150', category: 'resolution', width: 150, height: 150}),
        page({id: 'landscape', category: 'resolution', width: 800, height: 600, w: 0.7, h: 0.8}),
        negative('blank-white', '', 255), negative('blank-gray', ''), negative('blank-black', '', 0), negative('gradient-only', 'gradient'),
        negative('grid-only', 'grid'), negative('stripes-only', 'stripes'), negative('clutter-only', 'clutter'),
        page({id: 'curved-top', category: 'ambiguous', curved: true, expected: 'abstain'}),
        page({id: 'dark-paper', category: 'outside-scope', background: 220, paper: 45, expected: 'abstain'}));
    const multiple = negative('multiple-pages', ''); const g = multiple.image.getContext('2d')!;
    for (const x of [0.25, 0.75]) drawPaper(g, geometry({id: '', x, w: 0.38, h: 0.7}, 600, 800), 600, 800, {id: ''});
    multiple.category = 'ambiguous'; cases.push(multiple); return cases;
}
