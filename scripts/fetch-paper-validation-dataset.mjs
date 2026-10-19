import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, join} from 'node:path';
const commit = 'dec0cd018899a7e1c5d8f4880223f0e54941f616';
const output = resolve(process.argv[2] ?? 'tmp/paper-dataset');
const servedPath = process.argv[3] ?? '/tmp/paper-dataset/';
const base = `https://raw.githubusercontent.com/marquaye/scanic/${commit}/testImages/`;
const digest = data => createHash('sha256').update(data).digest('hex');
async function download(name) {
    let failure;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(`${base}${encodeURIComponent(name)}`, {signal: AbortSignal.timeout(45000)});
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${name}`);
            const data = Buffer.from(await response.arrayBuffer()); await writeFile(join(output, name), data); return data;
        } catch (error) {failure = error;}
    }
    throw failure;
}
await mkdir(output, {recursive: true});
const truth = await readFile(join(output, 'ground-truth.json')).catch(() => download('ground-truth.json'));
if (digest(truth) !== 'b39e11dfaa9b8934eee40fd893514dba715774727b3b8bb33b0c13e01d6a006e') throw new Error('Unexpected ground-truth hash');
const entries = Object.entries(JSON.parse(truth).images), images = new Array(entries.length);
async function entry(index) {
    const [name, value] = entries[index];
    const data = await readFile(join(output, name)).catch(() => download(name));
    const points = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map(key => ({x: value.corners[key].x / value.width, y: value.corners[key].y / value.height}));
    images[index] = {id: name, url: `${servedPath.replace(/\/$/, '')}/${encodeURIComponent(name)}`, width: value.width, height: value.height, points,
        expected: points.some(p => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) ? 'partial' : 'complete', sha256: digest(data),
        reviewed: value.reviewed, annotationSource: value.source};
}
for (let start = 0; start < entries.length; start += 4) await Promise.all(entries.slice(start, start + 4).map((_, offset) => entry(start + offset)));
const manifest = {source: `https://github.com/marquaye/scanic/tree/${commit}/testImages`, commit, groundTruthSha256: digest(truth), images};
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Prepared ${images.length} images at ${output}; commit: ${commit}`);
