import {scanDocument} from 'scanic';
import type {Point, Quad} from '../src/contracts.js';
import {validateSpec} from '../src/validation';
import {syntheticCases, type ValidationCase} from './paper-validation-cases';
import {assess, geometryMetrics} from './paper-validation-metrics';
interface Candidate {id: string; passed: boolean; status: string; metrics?: ReturnType<typeof geometryMetrics>}
interface Sample {id: string; url: string; width: number; height: number; points: Point[] | null; expected: ValidationCase['expected']; downloadError?: string}
async function load(sample: Sample): Promise<ValidationCase> {
    if (sample.downloadError) throw new Error(sample.downloadError);
    const image = new Image(); image.src = sample.url; await image.decode();
    if (image.naturalWidth !== sample.width || image.naturalHeight !== sample.height) throw new Error(`Mismatched dimensions: ${sample.id}`);
    const canvas = document.createElement('canvas'); canvas.width = sample.width; canvas.height = sample.height; canvas.getContext('2d')!.drawImage(image, 0, 0);
    return {...sample, image: canvas, category: sample.id === 'user-a.jpg' ? 'user-qualitative' : 'upstream-real'};
}
async function baseline(test: ValidationCase, candidate: Candidate | undefined) {
    const result = await scanDocument(test.image, {mode: 'detect', detector: 'classical', maxProcessingDimension: 800});
    let points: Quad | null = null;
    if (result.success && result.corners) {
        const q = result.corners;
        const proposed = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft].map(p => ({x: p.x / test.image.width, y: p.y / test.image.height})) as unknown as Quad;
        try {validateSpec({version: 1, selection: {kind: 'quad', points: proposed}}); points = proposed;} catch {}
    }
    const metrics = points && test.points ? geometryMetrics(points, test.points, test.image.width, test.image.height) : undefined;
    const status = points ? 'complete' : 'not-found', assessed = assess({expected: test.expected, status, metrics});
    return {id: test.id, category: test.category, expected: test.expected, baseline: {status, metrics, ...assessed}, candidate,
        regression: assessed.passed && !candidate?.passed, improvement: !assessed.passed && !!candidate?.passed};
}
async function checks(input: string) {
    const config = await (await fetch(input)).json(), manifest = await (await fetch(config.manifestUrl)).json();
    const candidate = await (await fetch(config.candidateReportUrl)).json();
    const results = [];
    for (const test of syntheticCases()) {results.push(await baseline(test, candidate.records.find((r: Candidate) => r.id === test.id))); test.image.width = test.image.height = 0;}
    for (const sample of manifest.images as Sample[]) {
        const test = await load(sample); results.push(await baseline(test, candidate.records.find((r: Candidate) => r.id === test.id))); test.image.width = test.image.height = 0;
    }
    const report = {summary: {total: results.length, baselinePassed: results.filter(r => r.baseline.passed).length,
        candidatePassed: results.filter(r => r.candidate?.passed).length, regressions: results.filter(r => r.regression).map(r => r.id), improvements: results.filter(r => r.improvement).map(r => r.id)},
        baselineVersion: 'scanic@1.7.1; classical; maxProcessingDimension=800', records: results};
    document.querySelector('pre')!.textContent = JSON.stringify(report.summary, null, 2); return report;
}
Object.assign(window, {runImageChecks: checks});
