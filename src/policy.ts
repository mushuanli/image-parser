import type {ImageLimits, ImageResizePolicy, ImageSpec} from './contracts.js';
import {ImageProcessingError} from './validation.js';

export const DEFAULT_IMAGE_SPEC: ImageSpec = Object.freeze({version: 1, selection: Object.freeze({kind: 'none'})});
export const DEFAULT_IMAGE_POLICY = Object.freeze({processorId: 'image-parser' as const,
    resize: Object.freeze({mode: 'max-edge' as const, maxEdge: 1024})});
export const DEFAULT_IMAGE_LIMITS: ImageLimits = Object.freeze({maxInputBytes: 20 * 1024 * 1024,
    maxDecodedPixels: 40_000_000, maxOutputPixels: 12_000_000, maxCanvasEdge: 8192});
export function validateResize(value: ImageResizePolicy): ImageResizePolicy {
    if (value?.mode === 'original') return {mode: 'original'};
    if (value?.mode !== 'max-edge' || !Number.isInteger(value.maxEdge) || value.maxEdge < 1 || value.maxEdge > 32768)
        throw new ImageProcessingError('invalid-policy');
    return {mode: 'max-edge', maxEdge: value.maxEdge};
}
export function resolveResize(override?: ImageResizePolicy, agent?: ImageResizePolicy): ImageResizePolicy {
    return validateResize(override ?? agent ?? DEFAULT_IMAGE_POLICY.resize);
}
export function fitDimensions(width: number, height: number, resize: ImageResizePolicy): {width: number; height: number} {
    if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)) throw new ImageProcessingError('invalid-policy');
    validateResize(resize);
    const scale = resize.mode === 'original' ? 1 : Math.min(1, resize.maxEdge / Math.max(width, height));
    return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}
