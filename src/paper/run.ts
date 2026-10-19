import {check} from '../validation.js';
import {paperSteps, type PaperDetection} from './detect.js';

/** Yield to input and cancellation between bounded pieces of the same audited algorithm. */
export async function detectPaperAsync(data: Uint8ClampedArray, width: number, height: number,
    signal: AbortSignal, assertOpen: () => void = () => {}): Promise<PaperDetection | null> {
    const steps = paperSteps(data, width, height), started = performance.now();
    let slice = started;
    try {
        while (true) {
            check(signal); assertOpen();
            const result = steps.next();
            if (result.done) {check(signal); assertOpen(); return result.value;}
            const now = performance.now();
            if (now - started > 2000) return {status: 'uncertain', reason: 'budget-exceeded'};
            if (now - slice >= 4) {
                await new Promise<void>(resolve => setTimeout(resolve, 0)); slice = performance.now();
            }
        }
    } finally {steps.return(null);}
}
