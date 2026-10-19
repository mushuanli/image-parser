import {spawn} from 'node:child_process';
import {readFile, readdir, writeFile, mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const library = fileURLToPath(new URL('..', import.meta.url));
const root = process.env.IMAGE_PARSER_BROWSER_ROOT ?? library;
const reportFile = process.env.IMAGE_PARSER_RESULT_FILE ? resolve(process.env.IMAGE_PARSER_RESULT_FILE)
    : join(await mkdtemp(join(tmpdir(), 'paper-detector-validation-')), 'report.json');
const runtimeFile = `${reportFile}.runtime.json`;
async function fingerprint() {
    const paths = (await readdir(join(library, 'src/paper'))).filter(name => name.endsWith('.ts')).sort().map(name => `src/paper/${name}`);
    const sourceFiles = await Promise.all(paths.map(async path => ({path, sha256: createHash('sha256').update(await readFile(join(library, path))).digest('hex')})));
    return {sourceFiles, sha256: createHash('sha256').update(JSON.stringify(sourceFiles)).digest('hex')};
}
async function browser(fixture, output) {
    const child = spawn(process.execPath, [join(library, 'scripts/browser-test.mjs')], {stdio: 'inherit', env: {...process.env,
        IMAGE_PARSER_BROWSER_ROOT: root, IMAGE_PARSER_BROWSER_FIXTURE: relative(root, join(library, fixture)),
        IMAGE_PARSER_RESULT_FILE: output, IMAGE_PARSER_SUMMARY_ONLY: '1', IMAGE_PARSER_BROWSER_TIMEOUT_MS: '120000'}});
    const code = await new Promise((done, reject) => {child.on('error', reject); child.on('exit', (code, signal) => done(signal ? 1 : code));});
    if (code !== 0) throw new Error(`Browser validation failed: ${fixture} (${code})`);
}
const before = await fingerprint();
await browser('examples/paper-validation.html', reportFile);
await browser('examples/paper-runtime.html', runtimeFile);
const report = JSON.parse(await readFile(reportFile, 'utf8')), runtime = JSON.parse(await readFile(runtimeFile, 'utf8'));
const after = await fingerprint();
if (before.sha256 !== after.sha256) throw new Error('Detector sources changed during validation; rerun the audit');
report.detectorSha256 = before.sha256; report.detectorSources = before.sourceFiles;
report.simulation = {cpuRate: Number(process.env.IMAGE_PARSER_CPU_RATE ?? 1), mobileViewport: !!process.env.IMAGE_PARSER_MOBILE, safariDeviceVerified: false};
report.runtimeContractsVerified = runtime.passed === true;
report.runtime = runtime;
report.browserMatrixVerified = false;
report.datasetCoverageVerified = report.dataset?.commit === 'dec0cd018899a7e1c5d8f4880223f0e54941f616'
    && report.groups.some(group => group.category === 'upstream-real' && group.total === 17);
report.measurementGatePassed = report.accepted;
// Device verification is a separate requirement; a CPU/viewport simulation cannot satisfy it.
report.accepted = report.measurementGatePassed && report.runtimeContractsVerified && report.browserMatrixVerified && report.datasetCoverageVerified;
await writeFile(reportFile, JSON.stringify(report, null, 2));
console.log(`Detector acceptance: ${report.accepted ? 'PASS' : 'FAIL'}; numerical gate: ${report.measurementGatePassed}; runtime contracts: ${report.runtimeContractsVerified}; report: ${reportFile}; sha256: ${before.sha256}`);
if (!report.accepted) process.exitCode = 1;
