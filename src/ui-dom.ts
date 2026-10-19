import {check, ImageProcessingError} from './validation.js';

export function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag); if (className) element.className = className;
    if (text !== undefined) element.textContent = text; return element;
}
export function button(label: string, action: () => void): HTMLButtonElement {
    const element = node('button', undefined, label); element.type = 'button'; element.addEventListener('click', action); return element;
}
const zh = {scan: '自动扫描', crop: '裁剪', view: '效果预览', size: '最长边', original: '保留原始尺寸', restore: '恢复原图',
    resetHint: '恢复当前图片的选区；自动尺寸设置仍然生效', processing: '处理中…', dimensions: '尺寸', previous: '上一张', next: '下一张',
    resizeHint: '适用于当前图片组，不放大小图', empty: '没有图片', invalid: '请检查选区与尺寸', updated: '已修改', images: '图片列表', detecting: '正在识别文档边界…', detected: '已识别边界，可微调四角后应用', notDetected: '未识别到清晰边界，请手动调整四角', manual: '已保留手动调整的四角', uncertain: '未能可靠确定纸张边界，已保留当前选区；请手动调整四角', partial: '纸张可能超出画面，已保留当前选区；请手动调整或补拍', ambiguous: '无法确定唯一纸张，已保留当前选区；请手动调整四角', budgetExceeded: '检测已超时，请手动调整四角'};
const en: typeof zh = {scan: 'Auto scan', crop: 'Crop', view: 'Preview', size: 'Maximum edge', original: 'Original dimensions', restore: 'Restore original',
    resetHint: 'Reset this selection; automatic resize still applies', processing: 'Processing…', dimensions: 'Dimensions', previous: 'Previous', next: 'Next',
    resizeHint: 'Applies to this group; smaller images are not enlarged', empty: 'No images', invalid: 'Check selection and dimensions', updated: 'Modified', images: 'Images', detecting: 'Detecting document edges…', detected: 'Edges detected; adjust corners before applying', notDetected: 'No clear boundary found; adjust the corners manually', manual: 'Manual corner adjustments retained', uncertain: 'No reliable page boundary. Selection retained; adjust the corners manually', partial: 'The page may extend outside the image. Selection retained; adjust manually or retake.', ambiguous: 'No unique page found. Selection retained; adjust the corners manually.', budgetExceeded: 'Detection timed out; adjust the corners manually'};
export type ImageEditorText = keyof typeof zh;
export function translator(locale?: string, custom?: (key: ImageEditorText) => string) {
    return (key: ImageEditorText): string => custom?.(key) ?? (locale?.startsWith('zh') ? zh : en)[key];
}

export async function loadPreviewImage(url: string, name: string, signal: AbortSignal): Promise<HTMLImageElement> {
    check(signal);
    const image = node('img'); image.alt = name;
    await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
            image.onload = image.onerror = null; signal.removeEventListener('abort', abort);
            if (error) {image.src = ''; reject(error);} else resolve();
        };
        const abort = () => finish(new ImageProcessingError('aborted'));
        image.onload = () => finish(); image.onerror = () => finish(new ImageProcessingError('decode-failed'));
        signal.addEventListener('abort', abort, {once: true}); image.src = url;
    });
    check(signal); return image;
}


export function waitForImageWork(pending: Promise<void>, signals: readonly AbortSignal[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => {for (const signal of signals) signal.removeEventListener('abort', abort);};
        const abort = () => {cleanup(); reject(new ImageProcessingError('aborted'));};
        for (const signal of signals) signal.addEventListener('abort', abort, {once: true});
        if (signals.some(signal => signal.aborted)) abort();
        void pending.then(() => {cleanup(); resolve();}, error => {cleanup(); reject(error);});
    });
}
