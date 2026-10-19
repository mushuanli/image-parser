import type {Point, Quad} from '../contracts.js';
import {channelSteps, thresholds, type PaperPlane} from './channels.js';
import {regionSteps} from './regions.js';
import {cutsPaper, edge, evidence, inkRatio, partialEvidence, possiblePaper, type PaperCandidate} from './evidence.js';
import {normalize, polygonArea, visible} from './geometry.js';
import {lineProposal} from './lines.js';
import {reduce} from './plane.js';
export type PaperDetection = {status: 'complete'; corners: Quad; confidence: number}
    | {status: 'partial'; outline: readonly Point[]}
    | {status: 'uncertain'; reason: 'ambiguous' | 'low-evidence' | 'budget-exceeded'};
interface Candidates {possible: Quad[]; complete: PaperCandidate[]; partial: {outline: readonly Point[]; area: number}[]}
function same(a: PaperCandidate, b: PaperCandidate, width: number, height: number): boolean {
    const distance = Math.min(...[0, 1, 2, 3].map(offset => Math.max(...a.corners.map((p, i) => {
        const q = b.corners[(i + offset) % 4]; return Math.hypot(p.x - q.x, p.y - q.y);
    }))));
    return distance < Math.hypot(width, height) * 0.035;
}
function* collect(plane: PaperPlane): Generator<void, Candidates> {
    const found: Candidates = {possible: [], complete: [], partial: []}, {width, height} = plane;
    for (const feature of plane.features) for (const threshold of thresholds(feature)) {
        const regions = yield* regionSteps(feature, threshold, width, height);
        for (const region of regions) {
            yield;
            const larger = possiblePaper(region, plane); if (larger) found.possible.push(larger);
            const candidate = evidence(region, plane);
            if (candidate) {
                if (!found.complete.some(other => same(other, candidate, width, height))) found.complete.push(candidate);
            } else if (partialEvidence(region, plane)) found.partial.push({outline: normalize(region.outline, width, height), area: region.hullArea});
        }
    }
    return found;
}
function select(found: Candidates, plane: PaperPlane): PaperDetection | null {
    const candidates = found.complete.filter(candidate => !cutsPaper(candidate.corners, found.possible));
    candidates.sort((a, b) => b.score - a.score || polygonArea(b.corners) - polygonArea(a.corners));
    if (candidates.length > 1 && !same(candidates[0], candidates[1], plane.width, plane.height)
        && candidates[1].score > candidates[0].score - 0.1) return {status: 'uncertain', reason: 'ambiguous'};
    return candidates.length ? {status: 'complete', corners: normalize(candidates[0].corners, plane.width, plane.height) as unknown as Quad,
        confidence: candidates[0].score} : null;
}
function verify(proposal: {status: string; corners: Quad}, found: Candidates, plane: PaperPlane): PaperDetection | null {
    // Clip the visible polygon for diagnostics; never clamp extrapolated corners into a crop.
    if (proposal.status === 'partial') return {status: 'partial', outline: visible(proposal.corners)};
    const corners = proposal.corners.map(p => ({x: p.x * plane.width, y: p.y * plane.height})) as unknown as Quad;
    if (cutsPaper(corners, found.possible)) return {status: 'uncertain', reason: 'low-evidence'};
    const support = Math.max(...plane.features.map(feature => Math.min(...corners.map((p, i) => edge(p, corners[(i + 1) % 4], {feature}, plane)))));
    return support >= 0.72 && inkRatio(corners, plane) >= 0.003 ? {status: 'complete', corners: proposal.corners, confidence: support} : null;
}
export function* paperSteps(data: Uint8ClampedArray, width: number, height: number): Generator<void, PaperDetection | null> {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 600_000
        || Math.max(width, height) > 1024 || data.length !== width * height * 4) throw new RangeError('Invalid or excessive detection plane');
    if (Math.min(width, height) < 16) return null;
    if (Math.max(width, height) > 480) {const small = yield* reduce(data, width, height); return yield* paperSteps(small.data, small.width, small.height);}
    const plane = yield* channelSteps(data, width, height);
    const found = yield* collect(plane), selected = select(found, plane);
    if (selected) return selected;
    const proposal = yield* lineProposal(data, width, height), verified = proposal ? verify(proposal, found, plane) : null;
    if (verified) return verified;
    found.partial.sort((a, b) => b.area - a.area);
    return found.partial.length ? {status: 'partial', outline: found.partial[0].outline} : null;
}
/** Synchronous audit entry; the processor uses the cooperative runner instead. */
export function detectPaperBoundary(data: Uint8ClampedArray, width: number, height: number): PaperDetection | null {
    const steps = paperSteps(data, width, height); let result = steps.next();
    while (!result.done) result = steps.next(); return result.value;
}
