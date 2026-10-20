export interface Point {readonly x: number; readonly y: number}
export type Quad = readonly [Point, Point, Point, Point];
export type ImageSelection = {readonly kind: 'none'}
    | {readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number}
    | {readonly kind: 'quad'; readonly points: Quad};
/** Each step uses normalized coordinates in the result of the previous step. */
export type ImageSpec = {readonly version: 1; readonly selection: ImageSelection}
    | {readonly version: 2; readonly steps: readonly ImageSelection[]; readonly selection: ImageSelection};
export type ImageResizePolicy = {readonly mode: 'original'} | {readonly mode: 'max-edge'; readonly maxEdge: number};
export interface ImageProcessingPolicy {readonly processorId: 'image-parser'; readonly resize: ImageResizePolicy}
export interface ImageSource {readonly id: string; readonly revision: string; readonly name: string;
    read(options: {readonly signal: AbortSignal}): Promise<Blob>}
export interface ImageInfo {readonly width: number; readonly height: number; readonly mimeType: string;
    readonly editable: boolean; readonly reason?: string}
export interface ImageOutput {readonly sourceId: string; readonly sourceRevision: string; readonly blob: Blob;
    readonly width: number; readonly height: number; readonly mimeType: string; readonly byteLength: number;
    readonly changed: boolean; readonly purpose: 'preview' | 'export'}
export interface ImageLimits {readonly maxInputBytes: number; readonly maxDecodedPixels: number;
    readonly maxOutputPixels: number; readonly maxCanvasEdge: number}
export interface InspectOptions {readonly signal: AbortSignal; readonly limits?: Partial<ImageLimits>}
export interface ProcessOptions extends InspectOptions {readonly recipe?: import('./processing.js').ImageRecipe; readonly resize?: ImageResizePolicy; readonly purpose?: 'preview' | 'export'}
export type ImageDetection = {readonly status: 'detected'; readonly spec: ImageSpec; readonly confidence?: number}
    | {readonly status: 'not-found'}
    /** Visible outline is diagnostic only; partial detection never supplies a crop spec. */
    | {readonly status: 'partial'; readonly outline: readonly Point[]}
    | {readonly status: 'uncertain'; readonly reason: 'ambiguous' | 'low-evidence' | 'budget-exceeded'};
export interface ImageProcessorOptions {readonly detector?: 'classical' | 'paper'}
export interface ImageProcessor {readonly id: 'image-parser'; readonly version: string; readonly defaults: ImageProcessingPolicy;
    detect?(source: ImageSource, options: InspectOptions): Promise<ImageDetection>;
    inspect(source: ImageSource, options: InspectOptions): Promise<ImageInfo>;
    process(source: ImageSource, spec: ImageSpec, options: ProcessOptions): Promise<ImageOutput>;
    dispose(): Promise<void>}
export interface ImageEditItem {readonly id: string; readonly revision: number; readonly original: ImageSource; readonly spec: ImageSpec}
export interface PreparedImage {readonly itemId: string; readonly expectedRevision: number; readonly spec: ImageSpec; readonly output: ImageOutput}
export interface ImageEditor {activate(itemId: string): Promise<void>; apply(options: {signal: AbortSignal}): Promise<void>; restoreOriginal(): void;
    getItems(): readonly ImageEditItem[]; prepare(options: {signal: AbortSignal}): Promise<readonly PreparedImage[]>;
    destroy(): Promise<void>}
