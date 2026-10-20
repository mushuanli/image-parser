import type {ImageRecipe} from './processing.js';
import {encodingQualities} from './processing.js';
import {check, ImageProcessingError} from './validation.js';
import {context, encode} from './canvas.js';

export async function encodeRecipe(canvas: HTMLCanvasElement, recipe: ImageRecipe, signal: AbortSignal): Promise<Blob> {
    if (recipe.color !== 'preserve') applyColor(canvas, recipe, signal);
    for (const quality of encodingQualities(recipe)) {
        check(signal);
        const blob = await encode(canvas, recipe.output.mimeType, signal, quality);
        if (recipe.output.maxBytes === undefined || blob.size <= recipe.output.maxBytes) return blob;
    }
    throw new ImageProcessingError('limit-exceeded');
}
function applyColor(canvas: HTMLCanvasElement, recipe: ImageRecipe, signal: AbortSignal): void {
    const ctx = context(canvas), image = ctx.getImageData(0, 0, canvas.width, canvas.height), data = image.data;
    for (let i = 0; i < data.length; i += 4) {
        if (i % 65536 === 0) check(signal);
        // Flatten transparent pixels onto white before document grayscale conversion.
        const alpha = data[i + 3] / 255;
        const gray = Math.round((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * alpha + 255 * (1 - alpha));
        const value = recipe.color === 'threshold' ? gray >= (recipe.threshold ?? 128) ? 255 : 0 : gray;
        data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
}
