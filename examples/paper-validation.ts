import type {Point} from '../src/contracts.js';
import {detectPaperBoundary} from './page-lines';
import {syntheticCases, type ValidationCase} from './paper-validation-cases';
import {validateSpec} from '../src/validation';
import {assess, geometryMetrics} from './paper-validation-metrics';
interface RealImage {id: string; url: string; expected: ValidationCase['expected']; points: readonly Point[] | null; width: number; height: number; downloadError?: string}
interface Manifest {source?: string; commit?: string; groundTruthSha256?: string; images: RealImage[]}
interface RecordResult {id: string; category: string; expected: ValidationCase['expected']; status: string; error?: string;
    points: readonly Point[] | null; metrics?: ReturnType<typeof geometryMetrics>; milliseconds: number; passed: boolean; unsafeComplete: boolean; specAccepted: boolean}
const sheet = document.createElement('canvas'); sheet.width = 1200; sheet.height = 1440;
const sheetContext = sheet.getContext('2d')!; sheetContext.fillStyle = '#222'; sheetContext.fillRect(0, 0, 1200, 1440); let captures = 0;
function capture(test: ValidationCase, result: RecordResult): void {
    if (result.passed || captures >= 12) return;
    const x = captures % 4 * 300, y = Math.floor(captures / 4) * 480; captures++;
    sheetContext.drawImage(test.image, x + 10, y + 40, 280, 410);
    for (const [points, color] of [[test.points, '#00eaff'], [result.points, '#ff4646']] as const) {
        if (!points) continue; sheetContext.strokeStyle = color; sheetContext.lineWidth = 2; sheetContext.beginPath();
        points.forEach((p, i) => {const px = x + 10 + p.x * 280, py = y + 40 + p.y * 410; if (i) sheetContext.lineTo(px, py); else sheetContext.moveTo(px, py);});
        sheetContext.closePath(); sheetContext.stroke();
    }
    sheetContext.fillStyle = '#fff'; sheetContext.font = '14px sans-serif'; sheetContext.fillText(test.id, x + 10, y + 18);
    sheetContext.fillText(`${result.expected} -> ${result.status}`, x + 10, y + 34);
}
function specAccepts(points: readonly Point[] | null): boolean {
    if (!points) return false;
    try {validateSpec({version: 1, selection: {kind: 'quad', points: points as import('../src/contracts.js').Quad}}); return true;} catch {return false;}
}
function measure(test: ValidationCase): RecordResult {
    const source = test.image, scale = Math.min(1, 800 / Math.max(source.width, source.height));
    const plane = document.createElement('canvas'); plane.width = Math.round(source.width * scale); plane.height = Math.round(source.height * scale);
    const g = plane.getContext('2d')!; g.drawImage(source, 0, 0, plane.width, plane.height);
    const pixels = g.getImageData(0, 0, plane.width, plane.height); let error: string | undefined;
    let detected: ReturnType<typeof detectPaperBoundary> = null; const started = performance.now();
    try {detected = detectPaperBoundary(pixels.data, plane.width, plane.height);} catch (failure) {error = String(failure);}
    const milliseconds = performance.now() - started, status = error ? 'error' : detected?.status ?? 'not-found';
    const corners = detected?.status === 'complete' ? detected.corners : null;
    const metrics = corners && test.points ? geometryMetrics(corners, test.points, source.width, source.height) : undefined;
    const result = {id: test.id, category: test.category, expected: test.expected, status, error, metrics, milliseconds,
        points: corners ?? (detected?.status === 'partial' ? detected.outline : null), ...assess({expected: test.expected, status, metrics}), specAccepted: specAccepts(corners)};
    plane.width = plane.height = 0; capture(test, result); return result;
}
async function realCase(item: RealImage): Promise<ValidationCase> {
    if (item.downloadError) throw new Error(item.downloadError);
    const image = new Image(); image.src = item.url; await image.decode();
    if (image.naturalWidth !== item.width || image.naturalHeight !== item.height) throw new Error(`Annotation dimensions ${item.width}x${item.height} != decoded ${image.naturalWidth}x${image.naturalHeight}`);
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d')!.drawImage(image, 0, 0); return {...item, category: item.id === 'user-a.jpg' ? 'user-qualitative' : 'upstream-real', image: canvas};
}
const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)] ?? 0;
function summary(records: readonly RecordResult[]) {
    const positive = records.filter(r => r.expected === 'complete'), partial = records.filter(r => r.expected === 'partial'), negative = records.filter(r => r.expected === 'abstain');
    const count = (items: readonly RecordResult[]) => ({total: items.length, passed: items.filter(r => r.passed).length});
    return {total: records.length, passed: records.filter(r => r.passed).length, complete: count(positive), partial: count(partial), negative: count(negative),
        unsafeComplete: records.filter(r => r.unsafeComplete).length, rejectedPartialSpecs: records.filter(r => r.status === 'partial' && !r.specAccepted).length, errors: records.filter(r => r.status === 'error').length,
        timing: {p50: percentile(records.map(r => r.milliseconds), 0.5), p95: percentile(records.map(r => r.milliseconds), 0.95), max: Math.max(...records.map(r => r.milliseconds)),
            over50ms: records.filter(r => r.milliseconds > 50).length}};
}
async function checks(manifestUrl?: string | null) {
    const records: RecordResult[] = [], cases = syntheticCases();
    // Warm JIT before timing; no detector constants are tuned during the audit.
    for (let i = 0; i < 2; i++) measure(cases[0]); captures = 0;
    for (const test of cases) {records.push(measure(test)); test.image.width = test.image.height = 0; await new Promise(resolve => setTimeout(resolve, 0));}
    let manifest: Manifest | undefined;
    if (manifestUrl) {
        const response = await fetch(manifestUrl); if (!response.ok) throw new Error(`Manifest ${response.status}`); manifest = await response.json();
        for (const item of manifest!.images) {
            try {const test = await realCase(item); records.push(measure(test)); test.image.width = test.image.height = 0;}
            catch (error) {records.push({id: item.id, category: 'dataset-error', expected: item.expected, status: 'error', error: String(error), points: null, milliseconds: 0, passed: false, unsafeComplete: false, specAccepted: false});}
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    const result = summary(records), completeRate = result.complete.passed / result.complete.total;
    const accepted = completeRate >= 0.95 && result.unsafeComplete === 0 && result.errors === 0 && result.partial.passed === result.partial.total && result.negative.passed === result.negative.total && result.timing.p95 <= 100;
    const groups = [...new Set(records.map(r => r.category))].map(category => ({category, ...summary(records.filter(r => r.category === category))}));
    const report = {accepted, gateVersion: 1, thresholds: {completeRate: 0.95, iou: 0.9, paperRecall: 0.97, maxCornerError: 0.03, maxUnsafeComplete: 0, p95Milliseconds: 100},
        summary: result, groups, dataset: manifest ? {source: manifest.source, commit: manifest.commit, groundTruthSha256: manifest.groundTruthSha256} : null,
        userAgent: navigator.userAgent, records, failureSheet: sheet.toDataURL('image/jpeg', 0.9)};
    document.querySelector('pre')!.textContent = JSON.stringify({...report, records: undefined, failureSheet: undefined}, null, 2); return report;
}
Object.assign(window, {runImageChecks: checks});
