import type {ImageDetection, ImageLimits, Quad, ImageProcessorOptions} from './contracts.js';
import {canvas, context, type DecodedImage} from './canvas.js';
import {check, validateSpec} from './validation.js';

/** Match Scanic's classical demo defaults, with one downscale inside the detector. */
async function classical(image: DecodedImage, limits: ImageLimits, signal: AbortSignal): Promise<ImageDetection> {
    const maxProcessingDimension = Math.max(1, Math.min(800, limits.maxCanvasEdge, Math.floor(Math.sqrt(limits.maxOutputPixels))));
    const {scanDocument} = await import('scanic'); check(signal);
    const result = await scanDocument(image.image as Parameters<typeof scanDocument>[0], {mode: 'detect', detector: 'classical', maxProcessingDimension});
    check(signal); if (!result.success || !result.corners) return {status: 'not-found'};
    // Use the editor's existing low-confidence threshold as an explicit crop guard.
    if (typeof result.confidence !== 'number' || !Number.isFinite(result.confidence) || result.confidence < 0.6)
        return {status: 'uncertain', reason: 'low-evidence'};
    const corners = result.corners;
    const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
        .map(point => ({x: point.x / image.width, y: point.y / image.height})) as unknown as Quad;
    try {return {status: 'detected', spec: validateSpec({version: 1, selection: {kind: 'quad', points}}),
        ...(typeof result.confidence === 'number' && Number.isFinite(result.confidence) ? {confidence: result.confidence} : {})};}
    catch {return {status: 'not-found'};}
}

/** The candidate detector is opt-in until the documented device gate has passed. */
export async function detectDocument(image: DecodedImage, limits: ImageLimits, signal: AbortSignal,
    detector: ImageProcessorOptions['detector'] = 'classical', assertOpen: () => void = () => {}): Promise<ImageDetection> {
    check(signal); assertOpen();
    if (detector === 'classical') return classical(image, limits, signal);
    const {detectPaperAsync} = await import('./paper/run.js'); check(signal); assertOpen();
    const edge = Math.min(800, limits.maxCanvasEdge, Math.floor(Math.sqrt(limits.maxOutputPixels)));
    const scale = Math.min(1, edge / Math.max(image.width, image.height));
    const plane = canvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)), limits);
    try {
        const ctx = context(plane); ctx.drawImage(image.image, 0, 0, plane.width, plane.height);
        const result = await detectPaperAsync(ctx.getImageData(0, 0, plane.width, plane.height).data, plane.width, plane.height, signal, assertOpen);
        check(signal); assertOpen();
        if (!result) return {status: 'not-found'};
        if (result.status !== 'complete') return result;
        try {return {status: 'detected', spec: validateSpec({version: 1, selection: {kind: 'quad', points: result.corners}})};}
        catch {return {status: 'uncertain', reason: 'low-evidence'};}
    } finally {plane.width = plane.height = 0;}
}
