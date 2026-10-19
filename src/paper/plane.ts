export function* reduce(data: Uint8ClampedArray, width: number, height: number) {
    const scale = 480 / Math.max(width, height), w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    const output = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        if (y % 8 === 0) yield;
        for (let x = 0; x < w; x++) {
        const sx = (x + 0.5) * width / w - 0.5, sy = (y + 0.5) * height / h - 0.5;
        const ix = Math.floor(sx), iy = Math.floor(sy), dx = sx - ix, dy = sy - iy;
        const a = (iy * width + ix) * 4, b = (iy * width + Math.min(width - 1, ix + 1)) * 4;
        const c = (Math.min(height - 1, iy + 1) * width + ix) * 4, d = (Math.min(height - 1, iy + 1) * width + Math.min(width - 1, ix + 1)) * 4;
        for (let channel = 0; channel < 4; channel++) output[(y * w + x) * 4 + channel] =
            (data[a + channel] * (1 - dx) + data[b + channel] * dx) * (1 - dy) + (data[c + channel] * (1 - dx) + data[d + channel] * dx) * dy;
    }
    }
    return {data: output, width: w, height: h};
}
