# Gemini watermark remover: implementation approach

Living implementation record, not a planning doc. Read this before touching either the image
(`apps/web/lib/image/gemini_watermark/`) or video (`apps/web/lib/video/gemini_watermark_video.ts`,
`apps/web/lib/image/gemini_watermark/video_*.ts`) pipeline. It replaces the earlier
"planning document only" version of this file, which is now stale — the core of both pipelines is
implemented, and this document instead tracks what has been ported from the reference project,
what has not, and why.

`.local/gemini-watermark-remover` is the reference: a real, mature, MIT licensed implementation of
this exact tool (npm package `gwr`, by GargantuaX/Jad, with contributions from AllenK). MIT permits
reusing its code and calibrated data (embedded alpha maps, size catalog) with attribution kept, so
this project ports it directly rather than re-deriving a template from scratch.

## How the reference project actually works (images)

Source: `.local/gemini-watermark-remover/src/core/`.

1. **Position is looked up, not searched for.** Gemini renders at a fixed, small set of official
   output dimensions; `geminiSizeCatalog.js` hardcodes every known size, its watermark
   `{ logoSize, marginRight, marginBottom }`, alternate configs for the same size (legacy era,
   large margin variant, v2 small variant), and a near official projection for sizes that are a
   uniform scale of a known one. Only after all of that fails does it drop to a coarse
   `>1024px → 96px/64px margin, else 48px/32px margin` rule.
2. **The alpha template is real captured data.** `alphaMap.js`: render the watermark over solid
   black, read `alpha = max(R,G,B) / 255` back. Embedded as base64 `Float32Array`s in
   `embeddedAlphaMaps.js` (48, 96, `96-20260520`, `36-v2`, plus symmetric compressed outline
   variants). Non standard sizes interpolate the 96px map; never regenerated from a formula.
3. **Removal is the exact algebraic inverse**, `blendModes.js: removeWatermark`:
   `original = (composited - alpha * logoValue) / (1 - alpha)`, with a noise floor on alpha and an
   `alphaGain` multiplier for fine tuning strength.
4. **Correlation scoring** (`adaptiveDetector.js`): zero mean normalized cross correlation between
   the candidate region and the alpha template (spatial), and the same on Sobel gradient magnitude
   (gradient, catches edge halos). Used to pick between catalog candidates, to verify a removal
   worked, and to gate a generic sliding search fallback.
5. **Multi pass removal** (`multiPassRemoval.js`): repeats the inverse blend up to 4 times,
   re-scoring after each pass, because some outputs composite the mark at more than one layer.
6. **A large, narrowly scoped "rescue" layer** (`watermarkProcessor.js`, 6,300+ lines) sits on top
   of all that: dozens of tightly gated refinement passes named after specific real bug reports —
   dark outline contour repair, edge halo cleanup, flat fill, anti template rescue, etc. This is a
   year plus of maintenance against real user reports, not core algorithm.

## How the reference project actually works (video)

Source: `.local/gemini-watermark-remover/src/video/`.

1. **Decode/encode via WebCodecs**, not FFmpeg — `mediabunny` wraps `VideoDecoder`/`VideoEncoder`
   so exact per pixel removal is viable in browser without a software WASM encoder.
2. **Its own position catalog** (`videoWatermarkCatalog.js`): a 1920x1080 reference geometry
   (72px, two margins) projected by scale, plus exact pixel overrides for common output sizes
   (1280x720, 1080x1920, 720x1280).
3. **Detect once, from sampled frames, not per frame.** `videoWatermarkDetector.js` samples
   `DEFAULT_SAMPLE_COUNT = 12` frames, scores every catalog candidate on each, and votes for the
   winner (`meanConfidence >= 0.18` and `voteRatio >= 0.6` to be confident).
4. **One seed gain for the whole export, not a per frame guess.** From those same sampled frames,
   `estimateAlphaSeedFromFrames` (`videoWatermarkDetector.js:1027`) runs the same gain bisection
   search the image path's calibration uses on each sample, discards frames where a different
   candidate won with real confidence, and takes the **median** across the rest. `adaptiveAlpha`
   defaults to **`false`** (`videoExport.js:38`) — with it off, every frame uses this one fixed
   seed gain. When turned on, refinement only runs above `FRAME_HIGH_CONFIDENCE = 0.14` and is
   damped to `±0.05` of the previous frame's gain (`ALPHA_FRAME_STEP_CAP`) to prevent flicker.
5. **Frames below `FRAME_LOW_CONFIDENCE = 0.035` are skipped entirely** — left untouched, not
   force processed against noise (`videoExport.js:719-728`).
6. **Residual cleanup is standard, default on**, not optional. `applyVideoResidualCleanup`
   (`videoCleanupBackends.js:1321`) runs after every processed frame's blend, at
   `DEFAULT_RESIDUAL_CLEANUP_STRENGTH = 1.5`: `applySoftResidualCleanup` builds a gradient
   weighted mask from the alpha template, inpaints the watermark footprint from its unmasked
   neighbors, and blends the repair back in with the surrounding texture preserved. This exists
   because the blend alone never fully erases a re-encoded watermark — the alpha template is only
   an approximation, and deblocking/chroma subsampling distort the mark's real footprint just
   enough that a faint trace survives the blend alone.
7. **Encoding uses an explicit config**, not a generic quality preset: AVC, 12 Mbps constant
   bitrate, 2 second keyframe interval, `latencyMode: 'quality'`, `contentHint: 'detail'`, and a
   BT.709 limited range color space stamped onto every encoded packet
   (`createVideoExportEncodingConfig`, `applyVideoExportDecoderColorSpace`, `videoExport.js:45`).
8. **A second, unrelated watermark type for Veo output** (`veoTextWatermarkDetector.js`): a
   rectangular "Veo" text badge, different template and search strategy from the sparkle. Not
   relevant to Gemini image sourced video.
9. **An opt-in AI denoise backend** (`allenkFdncnnDenoise.js` family): requires an ONNX runtime
   and a downloaded model; `DEFAULT_DENOISE_BACKEND = 'none'`, off unless explicitly requested.
10. **Alpha shape auto-tuning**: tests up to 5 alpha template variants per video and keeps
    whichever produces the lowest residual score. An accuracy refinement on top of the core
    pipeline, not part of it.

## What is implemented here, and where it still differs

Image (`apps/web/lib/image/gemini_watermark/`): items 1 through 5 above are ported faithfully —
`size_catalog.ts`, `embedded_alpha_maps.ts`, `correlation.ts`, `decision_policy.ts`,
`multi_pass_removal.ts`, tied together in `engine.ts`. **Not ported**: item 6, the rescue layer.
Two smaller standard-path pieces are also still missing — dark outline contour repair, and running
multiple ranked candidates instead of taking the first direct match — see phase 3 below.

Video (`apps/web/lib/video/gemini_watermark_video.ts`,
`apps/web/lib/image/gemini_watermark/video_*.ts`): items 1 through 7 above are now ported —
detection votes across 12 sampled frames, a single median seed gain is computed once and reused
for the whole export (item 4), low confidence frames are skipped (item 5), every processed frame
runs the ported `applySoftResidualCleanup` (item 6, `apps/web/lib/video/
gemini_watermark_residual_cleanup.ts`, default path only: `highQuality=false`,
`protectStructure=false`), and the encoding config matches the reference exactly (item 7: 12 Mbps
CBR, keyframe interval 2, `latencyMode: 'quality'`, `contentHint: 'detail'`, BT.709 color space
stamp). **Not ported, deliberately**: item 8 (Veo text watermark — wrong mark family for
Gemini-sourced video), item 9 (AI denoise — needs a hosted ONNX model, out of scope for a
browser-only tool with no model hosting), item 10 (alpha shape auto-tuning — marginal gain for
real added complexity), and the opt-in adaptive per-frame gain refinement (the reference's own
default is the fixed seed gain this project ports). Both the image and video tools accept a batch
of up to 20 files, processed sequentially (never in parallel — decoding/encoding several videos at
once would exhaust memory); this is a product decision on top of the reference, which is a
single-file userscript with no batch concept of its own.

### The soft residual cleanup can still leave a faint patch on very low texture backgrounds

On a smooth, low detail background (plain sand, a flat sky), the ported `applySoftResidualCleanup`
can leave a faint blurred patch shaped like the watermark's gradient ring, even though the mark
itself is gone. This was investigated directly against the reference rather than assumed: the
cleanup pass (`gemini_watermark_residual_cleanup.ts`), the seed gain estimation
(`video_frame_removal.ts`), and the video alpha template resolution (`video_alpha.ts`) were each
compared line by line against `videoCleanupBackends.js`, `videoWatermarkDetector.js`, and confirmed
byte-for-byte equivalent on the default code path. The reference's own `buildLumaStructureGuard`
mechanism, which could in principle reduce this, is gated behind `protectStructure: true` and is
only ever passed by the reference's optional AI denoise branch — never the default path this
project ports — and would not help here regardless, since it only suppresses blending where local
luma gradient is already high (sharp edges/detail), which a flat sand background does not have. So
this is an inherent property of the reference project's own default soft cleanup algorithm on this
class of background, not a porting bug; no code changed as a result of this investigation.

### Batch UI

Both workspaces (`apps/web/features/ai/gemini_watermark_remover/workspace.tsx`,
`.../gemini_video_watermark_remover/workspace.tsx`) follow the same `Entry[]`/`Result[]` list
pattern already used by `compress_image`: a single file keeps the original large before/after
view; two or more switch to a row list (thumbnail, name, size, a per row Preview and Download
once ready) with a "Download all" zip once more than one result exists. The Preview button opens
`components/tool_workspace/before_after_modal.tsx`, a small shared popup (original left, result
right) built for this since no existing component did a generic before/after compare for either
an image or a video row. Both "Remove watermark" buttons stay static text with a spinner only,
matching each other and avoiding a redundant percentage next to the progress bar underneath.

### Bug history worth keeping

The video pipeline originally reused the still-image catalog's "near official projection" as a
first-try match before falling back to the video catalog. For 1280x720 frames, that projection
(from the still catalog's 1408x768 entry) coincidentally landed close enough to the real video
watermark's position to pass the still-image path's correlation gate, so the frame got removed at
the still-image path's fixed full-strength blend — which over-subtracts on a video-attenuated
watermark and clips the result toward black. Fixed by adding
`isExactOfficialGeminiImageSize()` (`size_catalog.ts`) and only trusting the still-image path
outright when the input size is an exact Gemini still-image catalog dimension; anything else
(including every video frame resolution) tries the video-adaptive path first.

## Phased checklist

**Phase 1 — images, core pipeline.** Done.
- [x] Vendor `geminiSizeCatalog.js`'s data and `embeddedAlphaMaps.js`'s real captured templates
      into TypeScript (`size_catalog.ts`, `embedded_alpha_maps.ts`).
- [x] Catalog lookup → candidate scoring (spatial + gradient correlation) → best candidate →
      exact inverse blend → re-score → multi pass if residual remains → honest "not found" if
      nothing clears the gate (`engine.ts`, `correlation.ts`, `decision_policy.ts`,
      `multi_pass_removal.ts`).

**Phase 2 — video, core pipeline.** Done.
- [x] Port the video position catalog, including the exact pixel overrides for common output
      sizes (`video_size_catalog.ts`).
- [x] Detect once from sampled frames, voting across candidates for the winner
      (`gemini_watermark_video.ts: detectVideoWatermarkCandidate`).
- [x] Compute one seed alpha gain from the sampled frames (median of the bisection estimate,
      discarding frames a different candidate won), reuse it fixed for the whole export — not a
      per frame re-estimate seeded only by the previous frame's result.
- [x] Skip frames below the low confidence threshold rather than force processing them.
- [x] Port the standard residual cleanup pass (`gemini_watermark_residual_cleanup.ts`) and run it
      after every processed frame's blend.
- [x] Match the reference's explicit encoding config (bitrate, keyframe interval, latency mode,
      content hint, BT.709 color space stamp) instead of a generic quality preset.
- [x] Fix the still-image-catalog collision bug described above so video frames reliably route to
      the video-adaptive path.

**Batch support (product decision, not a reference pipeline phase).** Done.
- [x] Both tools accept up to 20 files at once, processed sequentially, with a per file result and
      a "Download all" zip once more than one result exists.

**Phase 3 — image path, remaining standard-path gaps.** Not started; lower priority since neither
gap has produced a reported failure so far.
- [ ] Port dark outline contour repair (`darkOutlineContourRepair.js` +
      `embeddedDarkOutlineAlphaMap.js` / `embeddedOutlineAlphaMap.js`) as a post removal stage.
- [ ] Generate and score multiple ranked candidates per image (up to 5, per
      `pipelineCandidateQuality.js`) instead of taking the first one that clears the correlation
      gate.

**Explicitly out of scope, not a future phase:** the 6,000+ line rescue layer in
`watermarkProcessor.js`, the Veo text watermark detector, the AI denoise backend, alpha shape
auto-tuning, and multi file batch processing. Revisit only if real sample testing turns up a
failure mode one of them specifically addresses.
