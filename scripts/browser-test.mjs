import {createServer} from 'vite';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
const root = process.env.IMAGE_PARSER_BROWSER_ROOT ?? new URL('..', import.meta.url).pathname;
const fixture = process.env.IMAGE_PARSER_BROWSER_FIXTURE ?? 'examples/browser.html';
const server = await createServer({root, configFile: false, optimizeDeps: {entries: [fixture]}, server: {host: '127.0.0.1', port: 0, hmr: false, watch: null}});
await server.listen();
const profile = await mkdtemp(join(tmpdir(), 'image-parser-browser-'));
const chrome = spawn(process.env.IMAGE_PARSER_BROWSER ?? '/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-background-networking', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], {stdio: 'ignore'});
const pending = new Map(); let socket, id = 0;
async function debugPort() {
    for (let i = 0; i < 100; i++) {
        try {return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);} catch {}
        if (chrome.exitCode !== null) throw new Error('Browser exited before debugger startup');
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Browser startup timeout');
}
function call(method, params = {}) {
    return new Promise((resolve, reject) => {
        const request = ++id, timer = setTimeout(() => {pending.delete(request); reject(new Error(`Timeout: ${method}`));}, Number(process.env.IMAGE_PARSER_BROWSER_TIMEOUT_MS ?? 25000));
        pending.set(request, result => {clearTimeout(timer); result.error ? reject(new Error(JSON.stringify(result.error))) : resolve(result.result);});
        socket.send(JSON.stringify({id: request, method, params}));
    });
}
try {
    const port = await debugPort(), url = `${server.resolvedUrls.local[0]}${process.env.IMAGE_PARSER_BROWSER_FIXTURE ?? 'examples/browser.html'}`;
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {method: 'PUT'})).json();
    socket = new WebSocket(target.webSocketDebuggerUrl); await once(socket, 'open');
    socket.addEventListener('message', event => {const result = JSON.parse(event.data); const finish = pending.get(result.id); if (finish) {pending.delete(result.id); finish(result);}
        if (result.method === 'Runtime.exceptionThrown') console.error('Browser exception:', result.params.exceptionDetails.exception?.description ?? result.params.exceptionDetails.text);});
    await call('Runtime.enable');
    socket.addEventListener('message', event => {const data = JSON.parse(event.data);
        if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') console.error('Browser console:', data.params.args.map(value => value.value ?? value.description).join(' '));});
    if (process.env.IMAGE_PARSER_CPU_RATE) await call('Emulation.setCPUThrottlingRate', {rate: Number(process.env.IMAGE_PARSER_CPU_RATE)});
    if (process.env.IMAGE_PARSER_MOBILE) await call('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 2, mobile: true});
    for (let i = 0; i < 100; i++) {
        const ready = await call('Runtime.evaluate', {expression: 'typeof window.runImageChecks === "function"', returnByValue: true});
        if (ready.result.value) break;
        if (i === 99) {console.error(await call('Runtime.evaluate', {expression: 'document.body.innerText.slice(0,1000)', returnByValue: true})); throw new Error('Browser fixture failed to load');}
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    const result = await call('Runtime.evaluate', {expression: `window.runImageChecks(${JSON.stringify(process.env.IMAGE_PARSER_INPUT_URL ?? null)})`, awaitPromise: true, returnByValue: true});
    if (result.exceptionDetails) {
        console.error(await call('Runtime.evaluate', {expression: 'document.body.innerText.slice(-1800)', returnByValue: true}));
        throw new Error(JSON.stringify(result.exceptionDetails));
    }
    if (process.env.IMAGE_PARSER_RESULT_FILE) await writeFile(process.env.IMAGE_PARSER_RESULT_FILE, JSON.stringify(result.result.value, null, 2));
    const summary = JSON.parse(JSON.stringify(result.result.value, (_key, value) => typeof value === 'string' && value.startsWith('data:image/') ? '[image data omitted]' : value));
    console.log('Browser pixel and interaction checks passed:', process.env.IMAGE_PARSER_SUMMARY_ONLY ? {...summary, records: undefined, failureSheet: undefined} : summary);
} finally {
    socket?.close(); chrome.kill('SIGTERM');
    if (chrome.exitCode === null) await Promise.race([once(chrome, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
    await server.close(); await rm(profile, {recursive: true, force: true});
}
