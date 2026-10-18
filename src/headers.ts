import {ImageProcessingError} from './validation.js';
export interface ImageHeader {width: number; height: number; mimeType: string; animated: boolean}
const ascii = (b: Uint8Array, offset: number, size: number) => String.fromCharCode(...b.subarray(offset, offset + size));
export function imageHeader(bytes: ArrayBuffer): ImageHeader {
    const b = new Uint8Array(bytes), v = new DataView(bytes);
    if (b.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n)) return png(b, v);
    if (b[0] === 255 && b[1] === 216) return jpeg(b, v);
    if (b.length >= 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return webp(b, v);
    throw new ImageProcessingError('unsupported-format');
}
function png(b: Uint8Array, v: DataView): ImageHeader {
    let animated = false;
    for (let offset = 8; offset + 12 <= b.length;) {
        const length = v.getUint32(offset), type = ascii(b, offset + 4, 4);
        if (length > b.length - offset - 12) throw new ImageProcessingError('decode-failed');
        if (type === 'acTL') animated = true;
        if (type === 'IDAT') break;
        offset += 12 + length;
    }
    return {width: v.getUint32(16), height: v.getUint32(20), mimeType: 'image/png', animated};
}
function jpeg(b: Uint8Array, v: DataView): ImageHeader {
    for (let p = 2; p + 4 <= b.length;) {
        if (b[p++] !== 255) throw new ImageProcessingError('decode-failed');
        while (b[p] === 255) p++;
        const marker = b[p++];
        if (marker === 217 || marker === 218) break;
        if (marker === 1 || marker >= 208 && marker <= 215) continue;
        if (p + 2 > b.length) break;
        const length = v.getUint16(p);
        if (length < 2 || p + length > b.length) break;
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 7)
            return {width: v.getUint16(p + 5), height: v.getUint16(p + 3), mimeType: 'image/jpeg', animated: false};
        p += length;
    }
    throw new ImageProcessingError('decode-failed');
}
function webp(b: Uint8Array, v: DataView): ImageHeader {
    const kind = ascii(b, 12, 4), u24 = (p: number) => b[p] | b[p + 1] << 8 | b[p + 2] << 16;
    if (kind === 'VP8X') return {width: u24(24) + 1, height: u24(27) + 1, mimeType: 'image/webp', animated: !!(b[20] & 2)};
    if (kind === 'VP8 ') return {width: v.getUint16(26, true) & 16383, height: v.getUint16(28, true) & 16383, mimeType: 'image/webp', animated: false};
    if (kind === 'VP8L' && b[20] === 47) return {width: 1 + (v.getUint32(21, true) & 16383),
        height: 1 + (v.getUint32(21, true) >>> 14 & 16383), mimeType: 'image/webp', animated: false};
    throw new ImageProcessingError('decode-failed');
}
