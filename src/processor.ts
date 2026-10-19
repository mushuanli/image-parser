import {detectDocument} from './detection.js';
import type {ImageProcessor, ImageSource, ImageSpec, ImageLimits, InspectOptions, ProcessOptions, ImageOutput, ImageProcessorOptions} from './contracts.js';
import {DEFAULT_IMAGE_LIMITS, DEFAULT_IMAGE_POLICY, fitDimensions, validateResize} from './policy.js';
import {check, ImageProcessingError, validateSpec} from './validation.js';
import {readBlob} from './source.js';
import {imageHeader} from './headers.js';
import {canvas, context, decode, encode, checkSize, type DecodedImage} from './canvas.js';
import {bounds} from './geometry.js';
import {recipeGeometry} from './recipe.js';
import {scan} from './scan.js';

function limits(value?: Partial<ImageLimits>): ImageLimits {
    const result = {...DEFAULT_IMAGE_LIMITS, ...value};
    if (!Object.values(result).every(v => Number.isSafeInteger(v) && v > 0)) throw new ImageProcessingError('invalid-policy');
    return result;
}
async function load(source: ImageSource, options: InspectOptions) {
    const budget = limits(options.limits); check(options.signal);
    const blob = await source.read({signal: options.signal}); check(options.signal);
    if (blob.size > budget.maxInputBytes) throw new ImageProcessingError('limit-exceeded');
    const header = imageHeader(await readBlob(blob)); check(options.signal);
    if (!header.width || !header.height || header.width * header.height > budget.maxDecodedPixels) throw new ImageProcessingError('limit-exceeded');
    if (header.animated) throw new ImageProcessingError('unsupported-format');
    const image = await decode(blob, options.signal).catch(error => {check(options.signal); throw error;});
    if (image.width * image.height > budget.maxDecodedPixels) {image.close(); throw new ImageProcessingError('limit-exceeded');}
    return {blob, header, image, budget};
}
async function render(image: DecodedImage, spec: ImageSpec, options: ProcessOptions, budget: ImageLimits): Promise<HTMLCanvasElement> {
    const {points, size: natural, perspective} = recipeGeometry(spec, image.width, image.height);
    const resize = validateResize(options.resize ?? DEFAULT_IMAGE_POLICY.resize);
    const target = fitDimensions(natural.width, natural.height, options.purpose === 'preview'
        ? {mode: 'max-edge', maxEdge: Math.min(1024, resize.mode === 'max-edge' ? resize.maxEdge : 1024)} : resize);
    if (perspective) return scan(image, points, target, budget, options.signal);
    const out = canvas(target.width, target.height, budget), box = bounds(points);
    context(out).drawImage(image.image, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height); return out;
}
async function processImage(source: ImageSource, spec: ImageSpec, options: ProcessOptions, assertOpen: () => void): Promise<ImageOutput> {
    assertOpen(); const {blob, header, image, budget} = await load(source, options);
    let out: HTMLCanvasElement | undefined;
    try {
        assertOpen(); check(options.signal);
        const size = fitDimensions(image.width, image.height, options.resize ?? DEFAULT_IMAGE_POLICY.resize);
        const unchanged = !recipeGeometry(spec, image.width, image.height).changed && size.width === image.width && size.height === image.height && options.purpose !== 'preview';
        if (unchanged) checkSize(size.width, size.height, budget);
        out = unchanged ? undefined : await render(image, spec, options, budget);
        const result = out ? await encode(out, header.mimeType, options.signal) : blob;
        assertOpen(); check(options.signal);
        return {sourceId: source.id, sourceRevision: source.revision, blob: result, width: out?.width ?? image.width,
            height: out?.height ?? image.height, mimeType: header.mimeType, byteLength: result.size,
            changed: !unchanged, purpose: options.purpose ?? 'export'};
    } finally {image.close(); if (out) out.width = out.height = 0;}
}
export function createImageProcessor(options: ImageProcessorOptions = {}): ImageProcessor {
    const detector = options.detector ?? 'classical';
    if (!['classical', 'paper'].includes(detector)) throw new ImageProcessingError('invalid-policy');
    let closed = false, queue: Promise<void> = Promise.resolve();
    const assertOpen = () => {if (closed) throw new ImageProcessingError('disposed');};
    const schedule = <T>(job: () => Promise<T>): Promise<T> => {
        const result = queue.then(job); queue = result.then(() => {}, () => {}); return result;
    };
    return {id: 'image-parser', version: '0.2.0', defaults: DEFAULT_IMAGE_POLICY,
        async process(source, input, options) {
            assertOpen(); const spec = validateSpec(input), captured = {...options, limits: options.limits ? {...options.limits} : undefined,
                resize: validateResize(options.resize ?? DEFAULT_IMAGE_POLICY.resize)};
            if (captured.purpose !== undefined && !['preview', 'export'].includes(captured.purpose)) throw new ImageProcessingError('invalid-policy');
            return schedule(() => processImage(source, spec, captured, assertOpen));
        },
        async detect(source, options) {
            const captured = {...options, limits: options.limits ? {...options.limits} : undefined};
            return schedule(async () => {
                assertOpen(); const {image, budget} = await load(source, captured);
                try {const result = await detectDocument(image, budget, captured.signal, detector, assertOpen); assertOpen(); check(captured.signal); return result;}
                finally {image.close();}
            });
        },
        async inspect(source, options) {
            const captured = {...options, limits: options.limits ? {...options.limits} : undefined};
            return schedule(async () => {
                assertOpen(); const {image, header} = await load(source, captured);
                try {assertOpen(); check(captured.signal); return {width: image.width, height: image.height, mimeType: header.mimeType, editable: true};}
                finally {image.close();}
            });
        }, async dispose() {closed = true;}};
}
