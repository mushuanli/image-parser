import {spawn} from 'node:child_process';
import {readFile, writeFile, mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const library = fileURLToPath(new URL('..', import.meta.url));
const root = process.env.IMAGE_PARSER_BROWSER_ROOT ?? library;
const reportFile = process.env.IMAGE_PARSER_RESULT_FILE ? resolve(process.env.IMAGE_PARSER_RESULT_FILE)
    : join(await mkdtemp(join(tmpdir(), 'paper-detector-validation-')), 'report.json');
const detector = await readFile(join(library, 'examples/page-lines.ts'));
const sha256 = createHash('sha256').update(detector).digest('hex');
const child = spawn(process.execPath, [join(library, 'scripts/browser-test.mjs')], {stdio: 'inherit', env: {...process.env,
    IMAGE_PARSER_BROWSER_ROOT: root, IMAGE_PARSER_BROWSER_FIXTURE: relative(root, join(library, 'examples/paper-validation.html')),
    IMAGE_PARSER_RESULT_FILE: reportFile, IMAGE_PARSER_SUMMARY_ONLY: '1', IMAGE_PARSER_BROWSER_TIMEOUT_MS: '120000'}});
const code = await new Promise((done, reject) => {child.on('error', reject); child.on('exit', (code, signal) => done(signal ? 1 : code));});
if (code !== 0) process.exit(code ?? 1);
const report = JSON.parse(await readFile(reportFile, 'utf8'));
report.detectorSha256 = sha256;
report.simulation = {cpuRate: Number(process.env.IMAGE_PARSER_CPU_RATE ?? 1), mobileViewport: !!process.env.IMAGE_PARSER_MOBILE, safariDeviceVerified: false};
report.runtimeContractsVerified = false;
report.browserMatrixVerified = false;
report.measurementGatePassed = report.accepted;
// The measurement gate is necessary; production also requires contract and device acceptance.
report.accepted = report.measurementGatePassed && report.runtimeContractsVerified && report.browserMatrixVerified;
await writeFile(reportFile, JSON.stringify(report, null, 2));
console.log(`Detector acceptance: ${report.accepted ? 'PASS' : 'FAIL'}; report: ${reportFile}; sha256: ${sha256}`);
if (!report.accepted) process.exitCode = 1;
