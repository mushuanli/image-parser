import type {ImageSpec, ImageSelection} from './contracts.js';
import {node} from './ui-dom.js';
import {withSelection} from './recipe.js';
type Rect = Extract<ImageSelection, {kind: 'rect'}>;

function resizeRect(rect: Rect, corner: string, x: number, y: number): Rect {
    const right = rect.x + rect.width, bottom = rect.y + rect.height;
    const left = corner.includes('w') ? Math.max(0, Math.min(x, right - 0.01)) : rect.x;
    const top = corner.includes('n') ? Math.max(0, Math.min(y, bottom - 0.01)) : rect.y;
    return {kind: 'rect', x: left, y: top,
        width: (corner.includes('e') ? Math.max(x, rect.x + 0.01) : right) - left,
        height: (corner.includes('s') ? Math.max(y, rect.y + 0.01) : bottom) - top};
}
function bindDrag(handle: HTMLButtonElement, host: HTMLElement, signal: AbortSignal, update: (x: number, y: number) => void): void {
    handle.addEventListener('pointerdown', event => {
        event.preventDefault(); event.stopPropagation(); handle.setPointerCapture?.(event.pointerId);
        const move = (next: PointerEvent) => {
            if (next.pointerId !== event.pointerId) return;
            const box = host.getBoundingClientRect(); if (!box.width || !box.height) return;
            update(Math.max(0, Math.min(1, (next.clientX - box.left) / box.width)), Math.max(0, Math.min(1, (next.clientY - box.top) / box.height)));
        };
        const stop = () => {
            handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', stop); handle.removeEventListener('pointercancel', stop);
        };
        handle.addEventListener('pointermove', move, {signal}); handle.addEventListener('pointerup', stop, {signal});
        handle.addEventListener('pointercancel', stop, {signal});
    }, {signal});
}
function translateRect(rect: Rect, event: KeyboardEvent): Rect {
    const step = event.shiftKey ? 0.05 : 0.005;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    return {...rect, x: Math.max(0, Math.min(1 - rect.width, rect.x + dx)), y: Math.max(0, Math.min(1 - rect.height, rect.y + dy))};
}
/** Rectangle handles remain constrained to the normalized current image plane. */
export function mountRectEditor(host: HTMLElement, initial: ImageSpec, changed: (spec: ImageSpec) => void): {destroy(): void} {
    let rect: Rect = initial.selection.kind === 'rect' ? {...initial.selection} : {kind: 'rect', x: 0.05, y: 0.05, width: 0.9, height: 0.9};
    const selection = node('div', 'image-editor__rect'), lifetime = new AbortController();
    host.append(selection);
    const draw = () => {
        selection.style.left = `${rect.x * 100}%`; selection.style.top = `${rect.y * 100}%`;
        selection.style.width = `${rect.width * 100}%`; selection.style.height = `${rect.height * 100}%`;
        changed(withSelection(initial, rect));
    };
    for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
        const handle = node('button', 'image-editor__handle'); handle.type = 'button'; handle.dataset.corner = corner;
        handle.setAttribute('aria-label', corner); selection.append(handle);
        bindDrag(handle, host, lifetime.signal, (x, y) => {rect = resizeRect(rect, corner, x, y); draw();});
        handle.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault(); rect = translateRect(rect, event); draw();
        }, {signal: lifetime.signal});
    }
    draw(); return {destroy() {lifetime.abort(); selection.remove();}};
}
