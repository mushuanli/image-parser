import type {ImageDetection, ImageLimits, Quad} from './contracts.js';
import type {DecodedImage} from './canvas.js';
import {check, validateSpec} from './validation.js';

/** Match Scanic's classical demo defaults, with one downscale inside the detector. */
export async function detectDocument(image: DecodedImage, limits: ImageLimits, signal: AbortSignal): Promise<ImageDetection> {
    const maxProcessingDimension = Math.max(1, Math.min(800, limits.maxCanvasEdge, Math.floor(Math.sqrt(limits.maxOutputPixels))));
    const {scanDocument} = await import('scanic'); check(signal);
    const result = await scanDocument(image.image as Parameters<typeof scanDocument>[0], {mode: 'detect', detector: 'classical', maxProcessingDimension});
    check(signal); if (!result.success || !result.corners) return {status: 'not-found'};
    const corners = result.corners;
    const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
        .map(point => ({x: point.x / image.width, y: point.y / image.height})) as unknown as Quad;
    try {return {status: 'detected', spec: validateSpec({version: 1, selection: {kind: 'quad', points}}),
        ...(typeof result.confidence === 'number' && Number.isFinite(result.confidence) ? {confidence: result.confidence} : {})};}
    catch {return {status: 'not-found'};}
}
