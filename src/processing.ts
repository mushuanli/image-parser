import {ImageProcessingError} from './validation.js';
import {validateResize} from './policy.js';
import type {ImageResizePolicy} from './contracts.js';

/** Portable policy; engines report their own identity and do not promise identical bytes. */
export interface ImageRecipe {
    readonly version: 1;
    readonly resize: ImageResizePolicy;
    readonly color: 'preserve' | 'grayscale' | 'threshold';
    readonly threshold?: number;
    readonly output: {readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; readonly quality: number;
        readonly minQuality?: number; readonly maxBytes?: number};
}
export function validateImageRecipe(value: ImageRecipe): ImageRecipe {
    if (!value || value.version !== 1 || !['preserve', 'grayscale', 'threshold'].includes(value.color)) invalid();
    const resize = validateResize(value.resize), out = value.output;
    if (!out || !['image/png', 'image/jpeg', 'image/webp'].includes(out.mimeType)
        || !Number.isFinite(out.quality) || out.quality < 0.1 || out.quality > 1) invalid();
    if (out.minQuality !== undefined && (!Number.isFinite(out.minQuality) || out.minQuality < 0.1 || out.minQuality > out.quality)) invalid();
    if (out.maxBytes !== undefined && (!Number.isSafeInteger(out.maxBytes) || out.maxBytes < 1)) invalid();
    if (value.threshold !== undefined && (!Number.isInteger(value.threshold) || value.threshold < 0 || value.threshold > 255)) invalid();
    return structuredClone({...value, resize});
}
/** At most five final encodes, always from the same pixels; never shrink text to meet a byte budget. */
export function encodingQualities(recipe: ImageRecipe): number[] {
    const {quality, minQuality = quality, mimeType} = recipe.output;
    if (mimeType === 'image/png' || minQuality === quality) return [quality];
    return Array.from({length: 5}, (_, i) => quality - (quality - minQuality) * i / 4);
}
function invalid(): never {throw new ImageProcessingError('invalid-policy');}

export const IMAGE_PROCESSOR_VERSION = '0.3.0';
