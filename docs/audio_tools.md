# Audio tools: state

Single source of truth for what the Audio category contains. Registry entries live in
`apps/web/lib/tools/registry.ts`. Audio has **10 tools across 3 sections** (declared in
`lib/tools/sections.ts`, same mechanism as PDF and Image) — each tool below is one registry
entry, one processor, one workspace. All 10 are `status: 'available'`.

Every tool shows real file sizes, never an estimate: the original file's own size, and the actual
result size once processing finishes — nothing is shown for the result before that point, since a
guessed number reads as a finished result before one exists.

Everything runs in the browser through FFmpeg compiled to WebAssembly (`@ffmpeg/ffmpeg`), the
same self hosted core used by Video (`public/ffmpeg/`, see `lib/video/ffmpeg_loader.ts`). Nothing
is uploaded.

Speed and pitch changes use only filters actually compiled into this project's ffmpeg core:
`atempo` (chained in 0.5..2 stages for factors outside that range) for a pitch preserving time
stretch, and `asetrate`/`aresample` for a combined speed and pitch change or an independent pitch
shift. No third party time stretching library (Rubber Band, Elastique, SoundTouch) is bundled, so
the workspace never offers an algorithm picker that would imply one is.

Opus and WebM output are left out of every audio tool below, not just Audio Converter: both use
`libopus`, and encoding to it reliably hits a fatal trap in this single threaded WASM core, on
every attempt, for any input, not the occasional field failure the video tool's own Opus note
describes. `resetFFmpeg()` still runs on that failure so it never poisons the next conversion in
the same tab.

## Checklist

- [x] Audio Converter — `convert-audio`
- [x] Audio Compressor — `compress-audio`
- [x] Video to Audio / Audio Extractor — `video-to-audio`
- [x] Audio Trimmer & Cutter — `trim-audio`
- [x] Audio Merger & Joiner — `merge-audio`
- [x] Volume Booster & Normalizer — `volume-booster`
- [x] Audio Speed & Pitch Changer — `audio-speed-pitch`
- [x] Reverse Audio — `reverse-audio`
- [x] Voice Recorder — `voice-recorder`
- [x] Audio Metadata Editor — `audio-metadata-editor`

## Convert & Compress — `convert-compress`

### 1. Audio Converter — `convert-audio`

**Built.** Format conversion with quality, sample rate, channel and cleanup controls in one tool.


| Feature     | Details                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formats     | MP3, WAV, M4A/AAC, OGG/Vorbis, FLAC. Opus and WebM are not offered; see the note above.                                                                                                                       |
| Quality     | Low/Normal/High/Very High/Best bitrate presets for lossy formats; hidden for WAV and FLAC, which are lossless and have no bitrate to set.                                                                     |
| Sample rate | Same as source, or 44100/48000/96000/192000 Hz.                                                                                                                                                               |
| Channels    | Same as source, mono, or stereo.                                                                                                                                                                              |
| Cleanup     | Optional loudness normalization (`loudnorm`) and metadata stripping (`-map_metadata -1`).                                                                                                                     |
| Preview     | A waveform (decoded client side via the Web Audio API) with click to seek, zoom, and a played/unplayed progress fill; falls back to a flat line with no loss of playback if a file can't be decoded into PCM. |
| Sizes       | Duration, the real original file size, and the real converted file size once conversion finishes — no estimate is shown before that, since a guess reads as a result.                                         |


### 2. Audio Compressor — `compress-audio`


| Feature      | Details                                                                            |
| ------------ | ---------------------------------------------------------------------------------- |
| Size control | Reduce file size with bitrate, quality, sample rate and target file size controls. |


### 3. Video to Audio / Audio Extractor — `video-to-audio`

**Built.** Extracts a chosen range of a video's own audio track; input is video, output is audio.

| Feature | Details |
| --- | --- |
| Input | MP4, MOV, WebM, MKV, AVI, FLV (same rule Video uses). |
| Output | MP3, WAV, M4A/AAC, OGG, FLAC, AIFF. Not Opus/WebM; see the note above. |
| Range | A shared `WaveformRangeTrim` component (`components/audio/waveform_range_trim.tsx`) draws the video's own audio track as a waveform — decoded straight from the video file via the Web Audio API, no separate probing step — with draggable start/end handles, plus a `TimeField` (`mm:ss.d`, typed or stepped) for each edge. Defaults to the whole clip; `-ss`/`-t` (not `-to`, to sidestep the ambiguity of combining `-ss` before `-i` with an output-relative `-to`) trims to exactly that range. |
| Quality | Low/Normal/High/Very High/Best bitrate presets for lossy formats; hidden for WAV, FLAC and AIFF, all lossless. |
| Sample rate | Same as source, or 44100/48000/96000 Hz. |
| Channels | Same as source, mono, or stereo. |
| Sizes | Source file size and resolution/fps (read via `readVideoMeta` + `probeVideo`), and the real extracted file size once extraction finishes. |


## Edit & Combine — `edit-combine`

### 4. Audio Trimmer & Cutter — `trim-audio`

**Built.** Cuts a source track into any number of sections on a waveform, drops the ones the
user deletes, and concatenates what's left into a single exported file.

| Feature | Details |
| --- | --- |
| Cuts | A shared `WaveformMultiTrim` component (`components/audio/waveform_multi_trim.tsx`) draws every cut boundary on the waveform; "Add Cut" splits the segment under the playhead into two. Each kept segment lists its own range and duration below the waveform with its own delete (cut) button; a cut segment stays visible, dimmed, so its removal is undoable rather than silent. |
| Undo/redo | Every cut or delete pushes a history entry; Undo and Redo step through it. Not tied to the browser's own undo. |
| Playback | Plays straight through the original file (cut spans dimmed but still audible on scrub) rather than a second skip aware engine, so what's previewed always matches the waveform exactly. Skip ±10s and jump to previous/next kept section, plus a volume and a zoom slider. |
| Fade | Optional fade in and fade out, both using the same fade duration, applied only to the first and last kept segment's own edges after concatenation. |
| Export | Re-encodes to the source file's own codec (mp3/wav/m4a/ogg/flac/aiff) via `ffmpeg`'s `atrim`+`concat`+`afade` filter graph; a lossy re-encode picks a bitrate estimated from the source file so trimming never silently drops quality. A `Pencil` rename affects only the displayed and downloaded file name, not what's sent to ffmpeg. |
| Sizes | Selected duration (sum of kept segments, real time, not fabricated), original duration, and the real exported file size once export finishes — no estimate is shown before that. |


### 5. Audio Merger & Joiner — `merge-audio`

**Built.** Combines any number of clips into one file, with a real two clip crossfade preview,
not just a preview of the export.

| Feature | Details |
| --- | --- |
| Files | Multiple files at once via the uploader or an "Add More Files" button; a pointer based drag handle (same pattern as Merge PDF) reorders the list, keyboard arrows work too. |
| Join type | One setting applied to every join: a silent Gap of N seconds, or a Crossfade of N seconds. A crossfade longer than the shortest clip is quietly shortened, with a note explaining why, rather than failing the export. |
| Per clip volume | A 0 to 100% slider per clip, baked into the ffmpeg `volume` filter for export and into live playback. |
| Timeline | Each clip renders as a coloured block with its own mini waveform, positioned by its real start and end time — a gap shows as real blank space, a crossfade shows the two blocks actually overlapping, not squeezed together and hoped into alignment. |
| Preview playback | Two hidden `<audio>` decks, each through its own Web Audio `GainNode`. In Gap mode one deck plays at a time. In Crossfade mode, entering the overlap window starts the incoming clip on the second deck at the matching offset and ramps both gains in real time — an actual simultaneous blend, not a sequential replay of the overlapping seconds from each clip in turn. Clicking anywhere on the timeline starts playback from that point; Play/Pause, ±10s skip, and previous/next clip all work mid-crossfade too. |
| Export | `ffmpeg` `atrim`+`concat` for gaps (silence generated with `anullsrc`, trimmed to the gap length) or a chained `acrossfade` filter for crossfades — the same real blend the preview approximates, not a separate code path. Output keeps every clip's shared extension, or falls back to MP3 for a mixed set. |
| Sizes | Total duration and total files are real (computed from the actual clips and join settings); the new file size is real too, shown only once export finishes. |


### 6. Volume Booster & Normalizer — `volume-booster`

**Built.** Boosts or reduces volume with real clipping headroom feedback, or normalizes to a
chosen loudness target instead.

| Feature | Details |
| --- | --- |
| Volume Booster | A 0 to 500% slider (100% is the source's own volume) plus +/− stepper buttons, backed by ffmpeg's `volume` filter. |
| Gain Adjustment | A separate −20 to +20 dB slider with quick presets, stacking multiplicatively with the volume percent (`resolveGainFactor` in `processor.ts` is the one place both the encode and the UI's headroom math read from). |
| Clipping feedback | Peak amplitude is measured client side (see Audio Info) so a "Max Allowed" percent and a clipping warning appear before export, not after. |
| Normalize | A toggle to loudnorm the file to a chosen LUFS target (broadcast, recommended, streaming or loud); overrides the volume/gain controls rather than stacking with them, since normalizing to an absolute loudness makes a manual multiplier meaningless. |
| Audio Info | Peak level, RMS level, an estimated integrated LUFS (ITU-R BS.1770 K-weighting without gating, so labelled "Estimated"), dynamic range (peak to RMS), channels, sample rate and bitrate, all computed from the real decoded file via `lib/audio/loudness.ts`. |
| Sizes | Real original file size, and the real exported file size once export finishes — no estimate is shown before that. |


### 7. Audio Speed & Pitch Changer — `audio-speed-pitch`

**Built.** Independent speed and pitch controls, plus a live preview that plays the current
settings without waiting for an export.

| Feature | Details |
| ------- | ------- |
| Speed and tempo | A 10 to 1000% slider (100% is the source's own speed) plus +/− stepper buttons and quick presets from 0.25x to 10x, backed by ffmpeg's `atempo` filter chained across as many 0.5..2 stages as the chosen factor needs. |
| Pitch | A −12 to +12 semitone slider plus stepper buttons and presets, backed by an `asetrate`/`aresample`/`atempo` chain that shifts pitch while keeping duration constant, independent of the speed control. Shows the shifted frequency of A4 (440 Hz) as a concrete reference. |
| Pitch preservation | A toggle: on keeps the original pitch while speed changes (a real time stretch); off lets speed and pitch move together, like a turntable sped up or slowed down. |
| Live preview | Plays the decoded file through the Web Audio API with `playbackRate` for speed and `detune` for pitch, so the current settings are heard immediately; no separate DSP library, no export required to check what a setting sounds like. |
| Sizes | Original and new duration (computed from the real speed factor) always shown; the real exported file size once export finishes, never an estimate. |


### 8. Reverse Audio — `reverse-audio`

**Built.** Shows the original and the reversed track as two separate, independently playable
waveforms before any export happens.

| Feature | Details |
| ------- | ------- |
| Preview | The reversed track is built client side (Web Audio decode, per channel sample reversal, wrapped back up as a real WAV file) as soon as the file is chosen, so it plays through the same `WaveformPlayer` as the original, no export or ffmpeg load required just to check it. |
| Export | ffmpeg's `areverse` filter, re-encoded to the source file's own codec, is the actual exported result; the client side reversal above is preview only. |
| Sizes | Duration, format, bitrate, sample rate and channels read straight from the source file; the estimated output size is the original file's own size (reversing changes neither length nor bitrate), clearly labelled as an estimate. The real exported file size shows once export finishes. |


## Record & Manage — `record-manage`

### 9. Voice Recorder — `voice-recorder`

**Built.** Records straight from the microphone with a live level meter, then hands the finished
take to the same waveform preview and export pipeline every other audio tool uses.

| Feature | Details |
| ------- | ------- |
| Recording | `MediaRecorder` captures from the chosen input device, with real pause and resume (the paused span is excluded from the file, not just muted). A scrolling level meter (`AnalyserNode`, canvas bars) shows input activity live while recording; a clock reads `hh:mm:ss`. |
| Microphone | Lists every audio input device from `navigator.mediaDevices.enumerateDevices()`, refreshed on permission grant and on `devicechange` (a USB headset plugged in mid session shows up without a reload). |
| Quality | Low/Standard/High/Very High bitrate presets or a custom kbps value, applied to the exported MP3 regardless of what the browser captured at. |
| Sample rate and channels | 22.05 to 96 kHz and mono/stereo are requested from the microphone as capture constraints, then enforced again with `-ar`/`-ac` on export, so the final file matches the chosen values even if the OS or browser didn't honour the capture request exactly. |
| After recording | Playback through the same `WaveformPlayer` every other audio tool uses, decoded from the real finished recording. Export re-encodes to MP3 through ffmpeg; the button doubles as Export before a result exists and Download once one does, matching Reverse Audio and the rest of the category. |
| Sizes | Duration and an estimated size (from the recording's length and chosen quality, clearly marked as an estimate) update live while recording; the real exported file size shows once export finishes. |


### 10. Audio Metadata Editor — `audio-metadata-editor`

**Built.** Reads and writes real ID3 tags via ffmpeg's own `ffprobe`/`ffmpeg`, never a hand
rolled binary tag parser, and always stream copies (`-c copy`) so audio quality and format never
change, only the tag data.

| Feature | Details |
| ------- | ------- |
| Reading | Title, artist, album, genre, year, track number/total, comment, composer and copyright are read from the file's real tags via ffprobe (`-show_format`); bitrate, sample rate and channel count come from the same probe and the decoded `AudioBuffer`. |
| Artwork | An embedded cover (the stream ffprobe reports with `disposition.attached_pic`) is extracted and shown as a real preview, not assumed from a generic icon. Upload replaces it with a new image; Remove drops it entirely. All three states (keep the original, remove, replace) are honoured by the export's stream mapping. |
| Undo/redo | Every field edit (on blur, so a run of keystrokes is one step) and every artwork action pushes a history entry; Undo and Redo step through both text and artwork together. |
| Export | `ffmpeg -c copy` re-mutes only the container's metadata and cover stream; the audio itself is never re-encoded, matching the "audio quality and file format remain the same" notice shown before export. |
| Sizes | Original format, duration, bitrate, sample rate, channels and file size are all real, read from the source file. |


## Shared conventions to build against

- Every result offers a view/preview action and a download action, same as Video and the other
categories.
- A live preview is required wherever an option is tuned by eye (trim range, fade points,
crossfade, volume curve); never make the user export to check what they picked.
- No hyphens or dashes in user facing text. Control panel copy stays a label plus a short caveat.

