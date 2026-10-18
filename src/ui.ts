import './style.css';
import type {ImageEditItem, ImageEditor, ImageProcessor, ImageResizePolicy, ImageLimits, PreparedImage, ImageSpec, ImageOutput} from './contracts.js';
import {DEFAULT_IMAGE_POLICY, DEFAULT_IMAGE_SPEC, validateResize} from './policy.js';
import {check, ImageProcessingError, validateSpec} from './validation.js';
import {button, node, translator, loadPreviewImage, waitForImageWork, type ImageEditorText} from './ui-dom.js';
import {appliedSpec, workingSpec, withSelection} from './recipe.js';
import {createBlobSource} from './source.js';
import {mountRectEditor} from './rect-editor.js';
import {mountCornerEditor} from './corner-editor.js';
export type {ImageEditor, ImageEditItem, PreparedImage} from './contracts.js';
export interface ImageEditorOptions {readonly items: readonly ImageEditItem[]; readonly activeId?: string; readonly processor: ImageProcessor;
    readonly resize?: ImageResizePolicy; readonly limits?: Partial<ImageLimits>; readonly locale?: string;
    readonly translate?: (key: ImageEditorText) => string; readonly onChange?: () => void;
    readonly onResize?: (resize: ImageResizePolicy) => void}
export function createImageEditor(container: HTMLElement, options: ImageEditorOptions): ImageEditor {
    return new Editor(container, options);
}
class Editor implements ImageEditor {
    private readonly root = node('div', 'image-editor');
    private readonly viewport = node('div', 'image-editor__viewport');
    private readonly status = node('p', 'image-editor__status');
    private readonly filmstrip = node('div', 'image-editor__images');
    private readonly t: ReturnType<typeof translator>;
    private readonly items: ImageEditItem[];
    private readonly baseline: string[];
    private resize: ImageResizePolicy;
    private readonly initialResize: string;
    private active = '';
    private lifetime = new AbortController();
    private binding?: AbortController;
    private tool?: {destroy(): void};
    private url?: string;
    private readonly thumbnails = new Map<string, string>();
    private generation = 0;
    private working = false;
    private scanning?: Promise<void>;
    private plane?: ImageOutput;
    constructor(container: HTMLElement, private readonly options: ImageEditorOptions) {
        this.t = translator(options.locale, options.translate);
        this.items = options.items.map(item => ({...item, spec: appliedSpec(validateSpec(item.spec))}));
        if (new Set(this.items.map(item => item.id)).size !== this.items.length) throw new ImageProcessingError('conflict');
        this.baseline = this.items.map(item => JSON.stringify(item.spec)); this.resize = validateResize(options.resize ?? DEFAULT_IMAGE_POLICY.resize);
        this.initialResize = JSON.stringify(this.resize); this.render(); container.append(this.root);
        if (this.items.length) void this.activate(options.activeId ?? this.items[0].id).catch(error => this.error(error));
    }
    private render(): void {
        const tools = node('div', 'image-editor__tools');
        for (const kind of ['none', 'rect', 'quad'] as const) {
            const label = this.t(kind === 'none' ? 'view' : kind === 'rect' ? 'crop' : 'scan');
            const control = button(label, () => {void (kind === 'none' ? this.preview() : kind === 'quad' ? this.scan() : this.mode(kind)).catch(error => this.error(error));}); control.dataset.tool = kind; tools.append(control);
        }
        const restore = button(this.t('restore'), () => this.restoreOriginal()); restore.title = this.t('resetHint'); tools.append(restore);
        const size = node('label', 'image-editor__size', this.t('size')), select = node('select'); select.setAttribute('aria-label', this.t('size'));
        for (const value of ['original', '512', '1024', '2048', '4096']) {const opt = node('option', undefined, value === 'original' ? this.t('original') : value); opt.value = value; select.append(opt);}
        const current = this.resize.mode === 'original' ? 'original' : String(this.resize.maxEdge);
        if (![...select.options].some(option => option.value === current)) {const option = node('option', undefined, current); option.value = current; select.append(option);}
        select.value = current; select.title = this.t('resizeHint');
        select.addEventListener('change', () => {if (this.working) return; this.resize = validateResize(select.value === 'original' ? {mode: 'original'} : {mode: 'max-edge', maxEdge: Number(select.value)});
            this.options.onResize?.(this.resize); this.options.onChange?.(); this.refreshFilmstrip();});
        size.append(select); this.filmstrip.setAttribute('aria-label', this.t('images'));
        this.root.append(tools, size, this.viewport, this.status, this.filmstrip); this.refreshFilmstrip();
    }
    private refreshFilmstrip(): void {
        this.filmstrip.replaceChildren();
        this.items.forEach((item, i) => {
            const changed = JSON.stringify(item.spec) !== this.baseline[i];
            const control = button(`${i + 1}. ${item.original.name}${changed ? ' · ' + this.t('updated') : ''}`, () => {void this.activate(item.id).catch(error => this.error(error));});
            control.dataset.imageId = item.id; control.setAttribute('aria-pressed', String(item.id === this.active)); control.disabled = this.working;
            const url = this.thumbnails.get(item.id);
            if (url) {const thumbnail = node('img'); thumbnail.src = url; thumbnail.alt = ''; control.prepend(thumbnail);}
            this.filmstrip.append(control);
        });
    }
    async activate(id: string): Promise<void> {
        this.assertEditable(); await this.display(id);
    }
    private async display(id: string, cached?: ImageOutput): Promise<void> {
        const item = this.items.find(item => item.id === id); if (!item) throw new ImageProcessingError('conflict');
        this.active = id; const generation = ++this.generation; this.release(); this.binding = new AbortController();
        const signal = this.binding.signal; this.status.textContent = this.t('processing'); this.refreshFilmstrip();
        const result = cached ?? await this.options.processor.process(item.original, workingSpec(item.spec), {signal, purpose: 'preview', resize: this.resize, limits: this.options.limits});
        if (generation !== this.generation) return; check(signal);
        this.plane = result;
        const oldThumbnail = this.thumbnails.get(id); if (oldThumbnail) URL.revokeObjectURL(oldThumbnail);
        this.thumbnails.set(id, URL.createObjectURL(result.blob)); this.refreshFilmstrip();
        this.url = URL.createObjectURL(result.blob);
        const image = await loadPreviewImage(this.url, item.original.name, signal);
        if (generation !== this.generation) return; check(signal);
        const surface = node('div', 'image-editor__surface'); surface.append(image); this.viewport.replaceChildren(surface);
        this.status.textContent = `${this.items.findIndex(row => row.id === id) + 1} / ${this.items.length} · ${result.width} × ${result.height}`;
        await this.mountTool(surface, image, item, signal, generation);
    }
    private async mountTool(surface: HTMLElement, image: HTMLImageElement, item: ImageEditItem, signal: AbortSignal, generation: number): Promise<void> {
        if (item.spec.selection.kind === 'rect') this.tool = mountRectEditor(surface, item.spec, spec => this.updateSpec(spec, generation));
        if (item.spec.selection.kind === 'quad') {
            const host = node('div', 'image-editor__scan'); this.viewport.replaceChildren(host);
            const editor = await mountCornerEditor(host, image, item.spec, signal, spec => this.updateSpec(spec, generation));
            if (generation !== this.generation || signal.aborted) editor.destroy(); else this.tool = editor;
        }
    }
    private updateSpec(spec: ImageSpec, generation: number): void {
        if (generation !== this.generation || this.lifetime.signal.aborted || this.working) return;
        const i = this.items.findIndex(item => item.id === this.active);
        try {const next = validateSpec(spec); if (JSON.stringify(next) === JSON.stringify(this.items[i].spec)) return;
            this.items[i] = {...this.items[i], spec: next}; this.refreshFilmstrip(); this.options.onChange?.();}
        catch (error) {this.error(error);}
    }
    private async mode(kind: 'none' | 'rect' | 'quad'): Promise<void> {
        this.assertEditable(); const i = this.items.findIndex(item => item.id === this.active); if (i < 0) return;
        const selection = kind === 'rect' ? {kind, x: 0.05, y: 0.05, width: 0.9, height: 0.9}
            : kind === 'quad' ? {kind, points: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}]} : {kind};
        if (this.items[i].spec.selection.kind !== kind) {
            this.items[i] = {...this.items[i], spec: withSelection(this.items[i].spec, selection as ImageSpec['selection'])};
            this.options.onChange?.();
        }
        await this.activate(this.active);
    }
    private scan(): Promise<void> {
        const work = this.autoScan(); this.scanning = work;
        void work.finally(() => {if (this.scanning === work) this.scanning = undefined;}).catch(() => {});
        return work;
    }
    private async autoScan(): Promise<void> {
        this.assertEditable(); const index = this.items.findIndex(item => item.id === this.active); if (index < 0) return;
        const target = this.items[index].id;
        if (this.items[index].spec.selection.kind !== 'quad') await this.mode('quad'); else await this.activate(target);
        if (this.active !== target || this.items[index].spec.selection.kind !== 'quad') return;
        const item = this.items[index], generation = this.generation, signal = this.binding!.signal, baseline = JSON.stringify(item.spec);
        const detect = this.options.processor.detect;
        if (!detect) {this.status.textContent = this.t('notDetected'); return;}
        this.status.textContent = this.t('detecting');
        try {
            const source = item.spec.version === 2 && item.spec.steps.length && this.plane
                ? createBlobSource(this.plane.blob, {id: item.id, revision: String(generation), name: item.original.name}) : item.original;
            const result = await detect.call(this.options.processor, source, {signal, limits: this.options.limits});
            if (generation !== this.generation || signal.aborted) return;
            if (JSON.stringify(this.items[index].spec) !== baseline) {this.status.textContent = this.t('manual'); return;}
            if (result.status === 'not-found') {this.status.textContent = this.t('notDetected'); return;}
            this.items[index] = {...item, spec: withSelection(item.spec, result.spec.selection)}; this.options.onChange?.();
            const mounting = this.activate(item.id), mountedGeneration = this.generation; await mounting;
            if (this.active === item.id && this.generation === mountedGeneration) {
                this.detectionStatus(result.confidence);
            }
        } catch (error) {if (generation !== this.generation || signal.aborted) return; this.status.textContent = this.t('notDetected');}
    }
    private detectionStatus(confidence?: number): void {
        this.status.textContent = this.t(confidence !== undefined && confidence < 0.6 ? 'uncertain' : 'detected')
            + (confidence !== undefined ? ` · ${Math.round(confidence * 100)}%` : '');
    }
    restoreOriginal(): void {
        try {this.assertEditable(); const index = this.items.findIndex(item => item.id === this.active); if (index < 0) return;
            this.items[index] = {...this.items[index], spec: DEFAULT_IMAGE_SPEC}; this.options.onChange?.();
            void this.activate(this.active).catch(error => this.error(error));} catch (error) {this.error(error);}
    }
    async apply({signal}: {signal: AbortSignal}): Promise<void> {
        check(signal); check(this.lifetime.signal);
        if (this.scanning) await waitForImageWork(this.scanning, [signal, this.lifetime.signal]);
        this.assertEditable(); const index = this.items.findIndex(item => item.id === this.active); if (index < 0) return;
        const item = this.items[index], spec = appliedSpec(item.spec), combined = new AbortController(), abort = () => combined.abort();
        this.working = true; this.root.inert = true;
        signal.addEventListener('abort', abort); this.lifetime.signal.addEventListener('abort', abort);
        try {
            check(signal); check(this.lifetime.signal);
            const result = await this.options.processor.process(item.original, spec, {signal: combined.signal, resize: this.resize, purpose: 'preview', limits: this.options.limits});
            check(signal); check(this.lifetime.signal);
            this.items[index] = {...item, spec};
            try {await this.display(item.id, result);} catch (error) {this.items[index] = item; throw error;}
            if (JSON.stringify(item.spec) !== JSON.stringify(spec)) this.options.onChange?.();
        } finally {signal.removeEventListener('abort', abort); this.lifetime.signal.removeEventListener('abort', abort);
            this.working = false; this.root.inert = false; this.refreshFilmstrip();}
    }
    private async preview(): Promise<void> {
        this.assertEditable(); const item = this.items.find(value => value.id === this.active); if (!item) return;
        const generation = ++this.generation; this.release(); this.binding = new AbortController(); const signal = this.binding.signal;
        const output = await this.options.processor.process(item.original, item.spec, {signal, resize: this.resize, purpose: 'preview', limits: this.options.limits});
        if (generation !== this.generation) return; check(signal);
        this.url = URL.createObjectURL(output.blob); const image = node('img'); image.alt = item.original.name; image.src = this.url;
        const surface = node('div', 'image-editor__surface'); surface.append(image); this.viewport.replaceChildren(surface);
        this.status.textContent = `${output.width} × ${output.height}`;
    }
    getItems(): readonly ImageEditItem[] {return this.items.map(item => ({...item, spec: structuredClone(item.spec)}));}
    async prepare({signal}: {signal: AbortSignal}): Promise<readonly PreparedImage[]> {
        check(signal); check(this.lifetime.signal);
        if (this.scanning) await waitForImageWork(this.scanning, [signal, this.lifetime.signal]);
        this.assertEditable(); this.working = true; this.root.inert = true; this.refreshFilmstrip();
        const captured = this.getItems(), resize = structuredClone(this.resize), output: PreparedImage[] = [];
        const combined = new AbortController(), abort = () => combined.abort();
        signal.addEventListener('abort', abort); this.lifetime.signal.addEventListener('abort', abort);
        try {
            check(signal); check(this.lifetime.signal);
            for (const [i, item] of captured.entries()) {
                if (JSON.stringify(item.spec) === this.baseline[i] && JSON.stringify(resize) === this.initialResize) continue;
                const result = await this.options.processor.process(item.original, item.spec, {signal: combined.signal, resize, purpose: 'export', limits: this.options.limits});
                check(signal); check(this.lifetime.signal); output.push({itemId: item.id, expectedRevision: item.revision, spec: appliedSpec(item.spec), output: result});
            }
            return output;
        } finally {signal.removeEventListener('abort', abort); this.lifetime.signal.removeEventListener('abort', abort);
            this.working = false; this.root.inert = false; this.refreshFilmstrip();}
    }
    private assertEditable(): void {check(this.lifetime.signal); if (this.working) throw new ImageProcessingError('conflict');}
    private error(error: unknown): void {if (!this.lifetime.signal.aborted && !(error instanceof ImageProcessingError && error.code === 'aborted')) this.status.textContent = error instanceof Error ? error.message : this.t('invalid');}
    private release(): void {
        const errors: unknown[] = [];
        for (const dispose of [() => this.binding?.abort(), () => this.tool?.destroy(), () => {if (this.url) URL.revokeObjectURL(this.url);}]) {
            try {dispose();} catch (error) {errors.push(error);}
        }
        this.tool = undefined; this.url = undefined;
        if (errors.length) throw new AggregateError(errors, 'Image plane cleanup failed');
    }
    async destroy(): Promise<void> {if (this.lifetime.signal.aborted) return; this.lifetime.abort(); ++this.generation;
        const errors: unknown[] = [];
        try {this.release();} catch (error) {errors.push(error);}
        for (const url of this.thumbnails.values()) {try {URL.revokeObjectURL(url);} catch (error) {errors.push(error);}}
        this.thumbnails.clear(); this.plane = undefined; this.root.remove(); if (errors.length) throw new AggregateError(errors, 'Image editor cleanup failed');}
}
