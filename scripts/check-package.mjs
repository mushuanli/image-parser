import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root = new URL('..', import.meta.url), path = file => new URL(file, root);
const pkg = JSON.parse(readFileSync(path('package.json'), 'utf8'));
assert.deepEqual(Object.keys(pkg.dependencies), ['scanic']);
assert.equal(pkg.dependencies.scanic, '1.7.1');
assert.equal(pkg.peerDependenciesMeta['@itookit/vfs-core'].optional, true);
for (const entry of Object.values(pkg.publishConfig.exports)) {
    for (const target of typeof entry === 'string' ? [entry] : Object.values(entry)) assert.ok(existsSync(path(target)), target);
}
for (const name of readdirSync(path('dist'))) {
    if (!/\.(?:js|cjs|ts)$/.test(name)) continue;
    const text = readFileSync(path(`dist/${name}`), 'utf8');
    assert.ok(!text.includes('/home/') && !text.includes('workspace:'), `Non-portable artifact: ${name}`);
    if (name.endsWith('.d.ts')) for (const match of text.matchAll(/from\s*['"]([.][^'"]+)['"]/g))
        assert.ok(match[1].endsWith('.js'), `NodeNext declaration import: ${name} -> ${match[1]}`);
    if (name.startsWith('index.') || name.startsWith('ui.')) assert.ok(!text.includes('@itookit/vfs-core'), `VFS leak: ${name}`);
}
console.log(`image-parser exports verified: ${resolve(new URL('.', root).pathname)}`);
