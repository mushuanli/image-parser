import type {ImageSource} from './contracts.js';
import {check} from './validation.js';

export function createBlobSource(blob: Blob, identity: {id: string; revision: string; name: string}): ImageSource {
    if (!identity.id || !identity.revision || !identity.name) throw new TypeError('Image identity is required');
    return Object.freeze({...identity, async read({signal}: {signal: AbortSignal}) {check(signal); return blob;}});
}
export function readBlob(blob: Blob): Promise<ArrayBuffer> {
    if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(reader.result as ArrayBuffer); reader.readAsArrayBuffer(blob);
    });
}
