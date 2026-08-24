# Video tools: state

Single source of truth for what the Video category contains. Registry entries live in
`apps/web/lib/tools/registry.ts`. Video has **6 tools total** — each tool below is one registry
entry, one processor, one workspace. The feature lists below are options inside that one
workspace, not separate tools or registry entries. The category does declare display sections
(`lib/tools/sections.ts`) grouping those 6 tools for the related tools list: Edit & Optimize,
Convert & Create, Record.

Compress Video, Resize & Crop Video, Trim & Cut Video, Convert Video, GIF Maker and Screen &
Camera Recorder are all `status: 'available'`.

Everything runs in the browser through FFmpeg compiled to WebAssembly (`@ffmpeg/ffmpeg`), self
hosted from `public/ffmpeg/` (copied from the `@ffmpeg/core` package — see
`lib/video/ffmpeg_loader.ts`) so nothing is fetched from a third party CDN. Nothing is uploaded.

Video tool pages use their own full width dashboard (`components/video/video_workspace_layout.tsx`)
instead of the 340px sticky aside every other category uses — a video tool needs room for two
players side by side plus a timeline. The whole control panel renders up front, before a file is
even chosen, so a visitor can see every option the tool offers without uploading anything first.
Before and after video is shown side by side with a "Sync playback" toggle
(`components/video/synced_video_pair.tsx`): on, playing, pausing or seeking either player mirrors
the other; off, each plays independently, e.g. to compare two different moments.

## Checklist

- [x] Compress Video — `compress-video`
- [x] Resize & Crop Video — `resize-crop-video`
- [x] Trim & Cut Video — `trim-cut-video`
- [x] Convert Video — `convert-video`
- [x] GIF Maker — `gif-maker` (video to GIF only; images to GIF, the GIF editor and GIF to video are not built yet)
- [x] Screen & Camera Recorder — `screen-recorder`

## 1. Compress Video — `compress-video`

**Built.** Reduce file size while keeping the video watchable.

| Feature | Details |
| --- | --- |
| Quality control | Slider (CRF style) or a target file size (KB/MB/GB, decimals like 1.5 MB) that searches for the closest bitrate. |
| Bitrate control | Manual video and audio bitrate for users who know what they want. |
| Preview | Before and after, side by side, with independent transport controls, a live waveform while each one plays, and a "Sync playback" toggle that lines both up to the same position on play. |
| Details | Resolution, frame rate, frame count, codec, bitrate and container read via FFmpeg's own `ffprobe`, shown under each player. |
| Audio | Kept by default, with its own lighter bitrate; never silently dropped. |

## 2. Resize & Crop Video — `resize-crop-video`

**Built.** Change the frame without touching the content inside it.

| Feature | Details |
| --- | --- |
| Resize | 480p to 4K presets or a custom width and height, aspect ratio locked by default. Every preset stays pickable even above the source's own resolution; going bigger just shows a plain "this interpolates pixels" caveat instead of being hidden, and uses lanczos resampling for the sharpest result either way. |
| Crop | A fully freeform crop box on the preview frame — drag the body to move it, or any of its eight handles to resize from that side or corner independently. Defaults to "Original" (the whole frame, nothing cut) so nothing is cropped away by surprise. |
| Aspect ratio presets | Original, plus social media shapes: 1:1 square, 9:16 story/reel/short, 16:9 landscape, 4:5 portrait. Picking one snaps the box to a centered crop at that ratio; dragging afterwards leaves it freeform. |
| Preview | The crop box is drawn on the "Before" pane in natural video pixel coordinates and converted to on screen pixels itself, accounting for the letterboxing the fixed 16:9 preview box adds for non 16:9 sources (`components/video/synced_video_pair.tsx`'s `cropBox`/`onCropBoxChange`, math in `lib/video/crop_drag.ts`). |

## 3. Trim & Cut Video — `trim-cut-video`

**Built.** Everything that changes which frames survive, in one timeline editor.

| Feature | Details |
| --- | --- |
| Trim | Drag a start and end handle on the timeline; single continuous clip. |
| Multiple cut points | Add more than one cut marker on the same timeline. |
| Remove segments | Mark ranges to delete; the rest is stitched back together in order. |
| Keep segments & merge | Inverse of remove: mark the ranges to keep, discard everything else. |
| Split | Break one file into separate downloadable parts at chosen points. |
| Reorder segments | Drag kept segments into a new order before the final merge. |
| Preview | The timeline scrubber always reflects the current cut list before export. |

## 4. Convert Video — `convert-video`

**Built.** Format conversion, both container and audio only extraction, in one tool.

| Feature | Formats |
| --- | --- |
| Video output | MP4, WebM, MOV, AVI, MKV, FLV, WMV, MPEG, OGV, 3GP, TS / MTS / M2TS, GIF. |
| Video to audio | MP3, WAV, AAC, M4A, FLAC, OGG, AIFF, WMA, AC3, M4R. |

Picking an audio only output switches the workspace to an audio result card instead of a video
one; there is no separate "Extract Audio" tool or route for this.

AMR is deliberately left out: it needs `libopencore_amrnb`, which is not compiled into the self
hosted FFmpeg WASM core (`public/ffmpeg/`, see `lib/video/ffmpeg_loader.ts`), so it would fail on
every attempt. OPUS is also left out: `libopus` is present and encoded cleanly in every local and
automated test, but it kept failing in the field with no reproducible cause found, so it was
pulled rather than kept as an option that sometimes silently doesn't work. WebM encodes with VP8
(`libvpx`), not VP9 (`libvpx-vp9`); VP9 reliably crashes this core's single threaded WASM runtime,
which then poisons every later conversion in the same tab until the page is reloaded.
`convertVideo` calls `resetFFmpeg()` on any failed run, including a failed preview build, so an
unexpected fatal encoder trap in one conversion cannot silently take out the next one.

## 5. GIF Maker — `gif-maker`

**Built (video to GIF only).** The other three rows below are not implemented yet.

| Feature | Details |
| --- | --- |
| Video to GIF | Built. A single trim window (`features/video/gif_maker/range_trim.tsx`) over a full length filmstrip: drag either edge handle to pick exactly the part that becomes the GIF, or drag the lit middle band to slide the whole window without changing its length. Left at its default 0..duration, the entire video converts — "whole clip" and "just this part" are the same control, not two different modes. Playback in the source preview loops the selected range only, so pressing play always previews exactly what will render. Frame rate (3 to 30 fps) and output width are both adjustable; height scales to match. Capped to 600 output frames (`MAX_FRAMES` in `processor.ts`) since a browser tab palette encoding much more than that gets impractically slow — pick a shorter range or a lower frame rate instead. |
| Images to GIF | Not built. Order a batch of images into frames with a per frame delay. |
| GIF editor | Not built. Trim, resize and change the playback speed of a GIF already on disk. |
| GIF to video | Not built. Convert an existing GIF back into an MP4 for platforms that reject GIF uploads. |

## 6. Screen & Camera Recorder — `screen-recorder`

**Built.** Uses `getDisplayMedia` / `getUserMedia`; nothing to encode server side, output is
muxed client side into a downloadable file.

| Feature | Details |
| --- | --- |
| Sources | Screen only, camera only, or screen and camera together, each with the microphone. |
| Camera overlay | Position, resize and rotate the camera bubble over the screen recording. |
| Camera shape | Rectangle, circle, rounded rectangle or a custom mask. |
| Camera styling | Border and drop shadow; background removal or blur behind the camera feed. |
| Controls | Pause and resume mid recording without ending the session. |

## Shared conventions to build against

- Timeline based tools (Trim & Cut) share one scrubber component, the same way PDF tools share
  `page_grid.tsx`.
- Every result offers a view action and a download action, same as PDF and Image, through
  whatever the video equivalent of `page_detail_modal.tsx` becomes.
- A live preview is required wherever an option is tuned by eye (crop rectangle, caption
  position, camera bubble placement); never make the user export to check what they picked.
- No hyphens or dashes in user facing text. Control panel copy stays a label plus a short caveat.
