# @itookit/image-parser

Browser image processing and a native DOM multi-image editing panel. Includes default maximum-edge resize (1024), constrained rectangle crop, and classical automatic document detection and manual four-corner perspective correction through Scanic 1.7.1. No OCR, annotation, history stack, ML detection or CDN assets are enabled.

Repository: `git@github.com:mushuanli/image-parser.git`.

For source consumption, add this directory to a pnpm workspace and depend on `@itookit/image-parser: workspace:*`; a TypeScript-aware bundler resolves the source exports. For standalone package consumption, run `pnpm install`, `pnpm build`, then `pnpm pack` in this repository and install the generated tarball with npm. Published artifacts use compiled exports and require no workspace aliases. Version 0.1.0 has not yet been published to the registry.

```ts
import {createImageProcessor, createBlobSource, DEFAULT_IMAGE_SPEC} from '@itookit/image-parser';

const processor = createImageProcessor();
const source = createBlobSource(file, {id: 'photo-1', revision: '1', name: file.name});
const result = await processor.process(source, DEFAULT_IMAGE_SPEC, {
  signal: new AbortController().signal,
});
// result.blob: maximum edge 1024; a smaller untouched image preserves its original bytes.
await processor.dispose();
```

Use `resize: {mode: 'original'}` to retain dimensions or `{mode: 'max-edge', maxEdge: 2048}` to change the limit. Version-one geometry uses coordinates normalized to the direction-corrected original. Version-two recipes retain applied steps, each normalized to the preceding result, plus a pending selection. Each step chooses either rectangle crop or perspective correction. Geometry is composed before sampling the immutable original once; changing resize never resamples a previously encoded export.

## Multi-image UI

```ts
import {createImageEditor} from '@itookit/image-parser/ui';
import '@itookit/image-parser/style.css';

const editor = createImageEditor(container, {
  processor,
  items: [{id: 'attachment-1', revision: 0, original: source, spec: DEFAULT_IMAGE_SPEC}],
  locale: 'zh-CN',
});
// Apply updates only the active working canvas and keeps the panel open.
await editor.apply({signal: new AbortController().signal});
// Done includes pending selections on every image and exports the whole changed group.
const replacements = await editor.prepare({signal: new AbortController().signal});
// Persist all candidate resources, validate each expectedRevision, then replace references together.
await editor.destroy();
```

`processor.detect(source, {signal})` returns a normalized quadrilateral or `status: 'not-found'`. The bundled processor detects document edges using Scanic's classical detector with the demo's default maximum processing dimension of 800 (or a smaller host budget), without downloading a model or calling a CDN. The optional ML detector remains disabled.

The panel's Auto scan action first detects corners, then allows manual refinement. If detection fails it keeps a manual quadrilateral. Late detection never overwrites manual adjustments or another image. `prepare()` waits for in-flight automatic detection and supports aborting that wait. Selecting Crop again after Preview retains the current crop.

The panel owns one active image plane and a multi-image navigation strip. Switching retains each image's current parameters. `restoreOriginal()` clears all applied steps and the pending selection on the active image. The resize policy remains in effect; choose original dimensions separately when needed. The host owns its modal, Apply/Done/Cancel buttons, focus restoration and persistence. Apply calls `editor.apply()` to update the active working plane, allowing scan → Apply → crop → Apply. Done calls `prepare()` and replaces attachments only after the whole group is saved. Reopening displays committed steps as the working image. Cancel discards every change since opening, including Apply; immutable originals remain available for restoration.

`prepare()` exports changed items sequentially and returns only when all exports succeed. Keep the panel mounted on a save error. `getItems()` returns an isolated working snapshot. Borrowed processors are never disposed by the panel.

## Optional VFS adapter

Import `createVfsImageSource` from `@itookit/image-parser/vfs` and supply an authorized `IFileSystem`, fixed path and resource-specific revision reader. The root/UI entries have no VFS dependency. The adapter does not infer projects, write files, release the filesystem, or treat transport errors as missing files.

## Limits and lifecycle

Input bytes, decoded pixels, output pixels and Canvas edge lengths have explicit budgets. PNG/APNG, JPEG and WebP headers are checked before full decoding; animated images are rejected for editing. EXIF orientation uses the browser decoder once. SVG/HEIC/GIF are not edited. Preview results are tagged and must never be uploaded as final exports.

Abort signals suppress late results; Scanic's synchronous work cannot be interrupted by a Promise alone. Manual scanning uses bounded intermediate planes. Export errors never fall back to unedited images while claiming success. URLs, bitmaps and canvases are released by their owner.

The package publishes ESM/CJS and declarations with root, `/ui`, `/vfs` and `/style.css` entries. Scanic requires Node >=22 for package tooling; image operations require browser image/Canvas APIs. npm and source-workspace consumption use the same public contracts.

Validation: `pnpm typecheck`, `pnpm test`, `pnpm build`. Real image/browser checks and integration status are recorded in the repository design document. Desktop automated checks do not establish iOS Safari compatibility.

## Experimental non-ML paper edges

`examples/paper-edges.html` compares a bounded, pure TypeScript line detector against centered light-paper scenes. It uses gradient-directed Hough voting and signed brightness contrast across candidate edges, then intersects four lines. It does not load Scanic's ML backend or any model. Out-of-frame intersections are reported as `partial` and retained for inspection; they are not clamped into a crop. This is an experimental example, excluded from package exports and the production automatic-scan path. It assumes a mostly centered, light document and does not establish accuracy for arbitrary backgrounds, dark documents or curved pages.

Run its synthetic checks with:

```sh
IMAGE_PARSER_BROWSER_FIXTURE=examples/paper-edges.html pnpm test:browser
```

The browser harness optionally passes `IMAGE_PARSER_INPUT_URL` to the fixture and saves its structured result, including any preview data, to `IMAGE_PARSER_RESULT_FILE`. A photo URL must be served by the local test server. The interactive example accepts a local file without uploading it.

### Production admission audit

`pnpm test:detector` runs a separate acceptance matrix for the experimental detector, saves JSON results and exits nonzero when admission fails. It does not replace production scanning. The current frozen prototype fails this audit; the ordinary unit test suite passing does not mean this detector is production-ready. Synthetic cases include positions, rotations, scale, contrast, noise, clutter, partial pages and negative images. Geometry uses visible polygon IoU, paper recall and cyclic corner error rather than bounding-box size.

The optional manifest supplied through `IMAGE_PARSER_INPUT_URL` adds local photo fixtures. It contains `images[]` entries with id, served URL, decoded width/height, normalized clockwise points and expected complete/partial/abstain. The upstream sample downloader is explicitly invoked with `node scripts/fetch-paper-validation-dataset.mjs <directory> <served-path>`; it pins the upstream commit and ground-truth hash. It does not run during installation or normal tests. Upstream labels are ML-assisted and marked reviewed, not independently relabeled by this project; inference in this audit uses no ML.

Use `IMAGE_PARSER_CPU_RATE=4 IMAGE_PARSER_MOBILE=1` for a Chromium stress run. That emulates CPU and viewport constraints and does not establish Safari or phone-device compatibility. The report distinguishes the numerical measurement gate from unverified production-adapter and browser acceptance.
