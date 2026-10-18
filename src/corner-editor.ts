import type {ImageSpec, Quad} from './contracts.js';
import {check} from './validation.js';
import {withSelection} from './recipe.js';

export async function mountCornerEditor(host: HTMLElement, image: HTMLImageElement, spec: ImageSpec,
    signal: AbortSignal, changed: (spec: ImageSpec) => void): Promise<{destroy(): void}> {
    const {createCornerEditor} = await import('scanic'); check(signal);
    const q: Quad = spec.selection.kind === 'quad' ? spec.selection.points
        : [{x: 0.05, y: 0.05}, {x: 0.95, y: 0.05}, {x: 0.95, y: 0.95}, {x: 0.05, y: 0.95}];
    const points = q.map(p => ({x: p.x * image.naturalWidth, y: p.y * image.naturalHeight}));
    const update = (corners: {topLeft: {x: number; y: number}; topRight: {x: number; y: number}; bottomRight: {x: number; y: number}; bottomLeft: {x: number; y: number}}) => {
        const values = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft].map(p => ({x: p.x / image.naturalWidth, y: p.y / image.naturalHeight}));
        changed(withSelection(spec, {kind: 'quad', points: values as unknown as Quad}));
    };
    // Scanic reads image.width before naturalWidth. A pixel-sized canvas avoids CSS layout dimensions.
    const plane = document.createElement('canvas'); plane.width = image.naturalWidth; plane.height = image.naturalHeight;
    plane.getContext('2d')!.drawImage(image, 0, 0, plane.width, plane.height);
    try {const editor = createCornerEditor({container: host, image: plane, corners: {topLeft: points[0], topRight: points[1], bottomRight: points[2], bottomLeft: points[3]},
        toolbar: {enabled: false}, keyboard: true, magnifier: {enabled: true}, onChange: update});
    update(editor.getCorners()); return editor;
    } finally {plane.width = plane.height = 0;}
}
