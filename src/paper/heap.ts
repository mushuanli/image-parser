interface Heap {indices: number[]; scores: Float32Array}
function higher(a: number, b: number, heap: Heap): boolean {
    return heap.scores[a] > heap.scores[b] || heap.scores[a] === heap.scores[b] && a < b;
}
function sift(index: number, heap: Heap): void {
    const {indices} = heap, value = indices[index];
    while (index * 2 + 1 < indices.length) {
        let child = index * 2 + 1;
        if (child + 1 < indices.length && higher(indices[child + 1], indices[child], heap)) child++;
        if (!higher(indices[child], value, heap)) break;
        indices[index] = indices[child]; index = child;
    }
    indices[index] = value;
}
/** Preserve the exhaustive peak order, including ties, while avoiding a full scan per peak. */
export function* peakHeap(scores: Float32Array): Generator<void, Heap> {
    const indices: number[] = [];
    for (let i = 0; i < scores.length; i++) {if (scores[i] >= 15) indices.push(i); if (i % 8192 === 0) yield;}
    const heap = {indices, scores: scores.slice()};
    for (let i = Math.floor(indices.length / 2) - 1; i >= 0; i--) {sift(i, heap); if (i % 4096 === 0) yield;}
    return heap;
}
export function popPeak(heap: Heap): number | undefined {
    if (!heap.indices.length) return;
    const best = heap.indices[0], tail = heap.indices.pop()!;
    if (heap.indices.length) {heap.indices[0] = tail; sift(0, heap);}
    return best;
}
