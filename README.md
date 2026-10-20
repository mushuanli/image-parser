# @itookit/image-parser

Browser image processing and a native DOM multi-image editing panel. Includes default maximum-edge resize (1024), constrained rectangle crop, and classical automatic document detection and manual four-corner perspective correction through Scanic 1.7.1. No OCR, annotation, history stack, ML detection or CDN assets are enabled.

Repository: `git@github.com:mushuanli/image-parser.git`.

For source consumption, add this directory to a pnpm workspace and depend on `@itookit/image-parser: workspace:*`; a TypeScript-aware bundler resolves the source exports. For standalone package consumption, run `pnpm install`, `pnpm build`, then `pnpm pack` in this repository and install the generated tarball with npm. Published artifacts use compiled exports and require no workspace aliases. Install the registry package with `npm install @itookit/image-parser@0.2.0`.

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

`processor.detect(source, {signal})` returns a normalized quadrilateral (`detected`), `not-found`, a diagnostic `partial` outline, or `uncertain` with a reason. The bundled processor detects document edges using Scanic's classical detector with the demo's default maximum processing dimension of 800 (or a smaller host budget), without downloading a model or calling a CDN. Classical results below the editor's existing 0.6 threshold, or with missing/non-finite scores, now return `uncertain` and retain the manual selection. This guard is not proof that a higher score has correct page boundaries. The optional ML detector remains disabled.

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

## Opt-in non-ML paper detector

```ts
const processor = createImageProcessor({detector: 'paper'});
const detection = await processor.detect(source, {signal});
if (detection.status === 'detected') {
  // Present detection.spec for manual review before applying it.
} else if (detection.status === 'partial') {
  // detection.outline describes a visible candidate, not a legal crop spec.
  // Keep the existing selection and offer manual adjustment or another photo.
}
```

The default remains `classical`; the application adapter has not switched its default. The opt-in path uses multi-threshold connected regions and independently verified Hough line proposals. It supports offset light pages, rejects competing candidates, and checks for larger surrounding paper before accepting an interior crop. This is a geometric heuristic, not semantic recognition of paper. Blank or difficult pages can require manual adjustment. No ML, model download, OpenCV or extra runtime dependency is introduced.

`partial` means an incomplete or potentially out-of-frame candidate, not proof that the actual page extends outside the image. Its outline is the visible clipped polygon, never extrapolated crop coordinates. Neither `partial` nor `uncertain` has a spec. The panel retains the current manual selection; an untouched full-frame selection is an identity operation and adds no export or re-encoding. Apply and Done remain available after a manual adjustment. Internal edge scores are not calibrated probabilities and are not returned as public confidence values by this detector.

The input plane is bounded by the host and 800 pixels; the pure TS kernel reduces it to at most 480 pixels independently of send resize. Computation is split into bounded generator steps and yields to the event loop with a four-millisecond target. Cancellation and processor disposal are checked between steps; a two-second elapsed-time budget returns uncertainty. This is cooperative scheduling, not a Worker or a hard per-frame deadline; browser decode and Canvas operations are not interruptible through this mechanism. Source and npm ESM/CJS builds use the same code and require no worker URL or CSP exception.

`examples/paper-edges.html` displays the current detector. The old centered prototype is preserved in `examples/page-lines-v1.ts` for provenance; it is not the production implementation.

## Detector admission audit

`pnpm test:detector` runs an explicit acceptance matrix, then exercises the public processor and editor in a real browser. It saves JSON and exits nonzero until every production admission requirement is satisfied. Geometry uses visible polygon IoU, paper recall and cyclic corner error; abstention does not count as successful complete-page localization. The report hashes every detector source rather than the example re-export. It separately records numerical, runtime-contract, dataset-coverage and device gates.

On the fixed 68-case development dataset, the repaired detector passed 66 cases: 49/51 complete pages, 7/7 partial pages and 10/10 abstention cases, with zero unsafe complete crops. Two real photos conservatively return partial. These samples were used during repair and are not an independent accuracy estimate. Safari device verification and independent photos remain required before changing the application default. Passing normal unit tests does not satisfy this admission gate.

The optional manifest in `IMAGE_PARSER_INPUT_URL` adds local photo fixtures: `images[]` entries contain ID, served URL, decoded dimensions, normalized clockwise points and expected complete/partial/abstain. Explicitly run `node scripts/fetch-paper-validation-dataset.mjs <directory> <served-path>` to download the pinned upstream set. It never runs during installation or ordinary tests. Upstream labels are ML-assisted and marked reviewed, not independently relabeled by this project; audit inference uses no ML.

Use `IMAGE_PARSER_CPU_RATE=4 IMAGE_PARSER_MOBILE=1` for a sequential Chromium stress run. CPU/viewport emulation does not establish Safari or phone-device compatibility. `IMAGE_PARSER_BROWSER_FIXTURE=examples/paper-runtime.html pnpm test:browser` exercises the opt-in public API and partial editor behavior independently.


## Portable output recipes

`ProcessOptions.recipe` accepts a version-one `ImageRecipe`: resize policy, preserve/grayscale/threshold color, optional threshold (0–255), and output MIME/quality/minQuality/maxBytes. `@itookit/image-parser/processing` exports the pure contract, validator and bounded quality schedule for host adapters without loading Canvas or Scanic. Recipes always render from the immutable original; they encode at most five quality levels from the same final pixels and reject an unmet byte budget without shrinking further. PNG uses a single encode. Recipe resize overrides the legacy resize option. Browser and native adapters record their own versions; their encoded bytes need not match.

Run `IMAGE_PARSER_BROWSER_FIXTURE=examples/processing.html pnpm test:browser` for real grayscale, threshold, output-budget and original-preservation checks.
