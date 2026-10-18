import type {Quad, ImageLimits} from './contracts.js';
import type {DecodedImage} from './canvas.js';
import {canvas, context, checkSize} from './canvas.js';
import {bounds, extent} from './geometry.js';
import {check, ImageProcessingError} from './validation.js';

/** Keep the private Scanic pixel plane bounded before its warp allocates memory. */
export async function scan(image: DecodedImage, points: Quad, target: {width: number; height: number},
    limits: ImageLimits, signal: AbortSignal): Promise<HTMLCanvasElement> {
    const box = bounds(points), natural = extent(points);
    const scale = Math.min(1, target.width / natural.width, target.height / natural.height);
    const plane = canvas(Math.max(1, Math.round(box.width * scale)), Math.max(1, Math.round(box.height * scale)), limits);
    try {
        context(plane).drawImage(image.image, box.x, box.y, box.width, box.height, 0, 0, plane.width, plane.height);
        const mapped = points.map(p => ({x: (p.x - box.x) * plane.width / box.width, y: (p.y - box.y) * plane.height / box.height}));
        const predicted = extent(mapped as unknown as Quad); checkSize(predicted.width, predicted.height, limits);
        const {extractDocument} = await import('scanic'); check(signal);
        const result = await extractDocument(plane, {topLeft: mapped[0], topRight: mapped[1], bottomRight: mapped[2], bottomLeft: mapped[3]}, {output: 'canvas'});
        const output = result.output;
        if (!result.success || !output || typeof output === 'string' || !('getContext' in output)) throw new ImageProcessingError('invalid-selection');
        try {check(signal); const final = canvas(target.width, target.height, limits); context(final).drawImage(output, 0, 0, target.width, target.height); return final;}
        finally {output.width = output.height = 0;}
    } finally {plane.width = plane.height = 0;}
}
