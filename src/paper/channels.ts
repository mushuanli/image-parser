export interface PaperPlane {width: number; height: number; gray: Uint8Array; features: Uint8Array[]}
function otsu(channel: Uint8Array): number {
    const histogram = new Uint32Array(256); let total = 0;
    for (const value of channel) {histogram[value]++; total += value;}
    let count = 0, sum = 0, best = 0, score = -1;
    for (let t = 0; t < 255; t++) {
        count += histogram[t]; sum += t * histogram[t]; if (!count || count === channel.length) continue;
        const mean = sum / count - (total - sum) / (channel.length - count), variance = count * (channel.length - count) * mean * mean;
        if (variance > score) {score = variance; best = t;}
    }
    return best;
}
export function* channelSteps(data: Uint8ClampedArray, width: number, height: number): Generator<void, PaperPlane> {
    const gray = new Uint8Array(width * height), neutral = new Uint8Array(gray.length), yellow = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i++) {
        if (i % 8192 === 0) yield;
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], luma = (r * 54 + g * 183 + b * 19) / 256;
        gray[i] = luma; neutral[i] = Math.max(0, luma - 1.5 * (Math.max(r, g, b) - Math.min(r, g, b)));
        yellow[i] = Math.min(255, Math.max(0, (r + g - 2 * b) * 1.5));
    }
    const features = [gray];
    if (neutral.some((value, i) => Math.abs(value - gray[i]) > 2)) features.push(neutral);
    if (yellow.some(value => value > 12)) features.push(yellow);
    return {gray, width, height, features};
}
export function thresholds(channel: Uint8Array): number[] {
    const histogram = new Uint32Array(256); for (const value of channel) histogram[value]++;
    const levels: number[] = []; let count = 0, next = 0.15;
    for (let value = 0; value < 256; value++) {
        count += histogram[value];
        while (count >= channel.length * next && next < 1) {levels.push(value); next += 0.15;}
    }
    const unique = [...new Set(levels)].sort((a, b) => a - b), center = otsu(channel);
    return [...new Set([center, Math.min(250, center + 20), ...unique.slice(1).map((value, i) => Math.floor((unique[i] + value) / 2))])];
}

export function channels(data: Uint8ClampedArray, width: number, height: number): PaperPlane {
    const steps = channelSteps(data, width, height); let result = steps.next();
    while (!result.done) result = steps.next(); return result.value;
}
