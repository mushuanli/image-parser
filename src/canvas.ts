import type {ImageLimits} from './contracts.js';
import {check, ImageProcessingError} from './validation.js';
export interface DecodedImage {image: CanvasImageSource; width: number; height: number; close(): void}
export function checkSize(width: number, height: number, limits: ImageLimits): void {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
        || Math.max(width, height) > limits.maxCanvasEdge || width * height > limits.maxOutputPixels)
        throw new ImageProcessingError('limit-exceeded');
}
export function canvas(width: number, height: number, limits: ImageLimits): HTMLCanvasElement {
    checkSize(width, height, limits);
    const result = document.createElement('canvas'); result.width = width; result.height = height; return result;
}
export function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = canvas.getContext('2d'); if (!ctx) throw new ImageProcessingError('decode-failed');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; return ctx;
}
export async function decode(blob: Blob, signal: AbortSignal): Promise<DecodedImage> {
    check(signal);
    if (typeof createImageBitmap === 'function') {
        const image = await createImageBitmap(blob, {imageOrientation: 'from-image'});
        if (signal.aborted) {image.close(); check(signal);}
        return {image, width: image.width, height: image.height, close: () => image.close()};
    }
    return decodeElement(blob, signal);
}
async function decodeElement(blob: Blob, signal: AbortSignal): Promise<DecodedImage> {
    const image = new Image(), url = URL.createObjectURL(blob);
    try {
        await new Promise<void>((resolve, reject) => {
            const abort = () => {image.onload = image.onerror = null; image.src = ''; reject(new ImageProcessingError('aborted'));};
            signal.addEventListener('abort', abort, {once: true});
            image.onload = () => {image.onload = image.onerror = null; signal.removeEventListener('abort', abort); resolve();};
            image.onerror = () => {image.onload = image.onerror = null; signal.removeEventListener('abort', abort); reject(new ImageProcessingError('decode-failed'));};
            image.src = url;
        });
        check(signal);
        return {image, width: image.naturalWidth, height: image.naturalHeight, close: () => {image.src = '';}};
    } finally {URL.revokeObjectURL(url);}
}
export async function encode(value: HTMLCanvasElement, mimeType: string, signal: AbortSignal): Promise<Blob> {
    check(signal);
    const blob = await new Promise<Blob | null>(resolve => value.toBlob(resolve, mimeType, 0.92));
    check(signal);
    if (!blob || blob.type !== mimeType) throw new ImageProcessingError('encode-failed');
    return blob;
}
