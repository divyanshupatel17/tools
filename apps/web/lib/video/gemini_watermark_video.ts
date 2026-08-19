/**
 * Removes the Gemini sparkle watermark from every frame of a video: detect the mark's position
 * and a single seed alpha gain once from a handful of sampled frames (voting/median across them,
 * since a single frame can be unrepresentative), then walk every frame, apply the same reverse
 * alpha blend the still image path uses at that fixed gain, and run the same residual cleanup
 * pass the reference project treats as standard.
 *
 * Demuxing, decoding, encoding and muxing all run through `mediabunny` (MPL 2.0), a WebCodecs
 * based media library, the same approach `.local/gemini-watermark-remover`'s video export uses
 * (`src/video/videoExport.js`). This keeps the whole pipeline in the browser with no FFmpeg
 * involved for the pixel work; audio is copied through as encoded packets, never re-encoded.
 *
 * This mirrors the reference project's *default* export path exactly: a fixed seed gain for the
 * whole video (`adaptiveAlpha: false` upstream), a low confidence skip per frame, and the default
 * soft residual cleanup pass. Not ported: the opt-in adaptive per frame gain refinement, the AI
 * denoise backends, the Veo text watermark family, multi track handling, low confidence override,
 * and multi file batch processing. See `docs/gemini_watermark_remover_approach.md`.
 */

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
  canEncodeVideo,
  type EncodedPacket,
  type InputVideoTrack,
} from 'mediabunny';
import {
  estimateFrameAlphaGain,
  removeWatermarkFromFrameRegion,
  scoreCandidateOnFrame,
} from '@/lib/image/gemini_watermark/video_frame_removal';
import { resolveVideoWatermarkCandidates, type VideoWatermarkCandidate } from '@/lib/image/gemini_watermark/video_size_catalog';
import { applySoftResidualCleanup } from './gemini_watermark_residual_cleanup';

const DETECTION_SAMPLE_COUNT = 12;
const MIN_MEAN_CONFIDENCE = 0.18;
const MIN_VOTE_RATIO = 0.6;
/** A frame this weak in signal is left untouched rather than force processed against noise. */
const FRAME_LOW_CONFIDENCE = 0.035;
/** Reference project default (`DEFAULT_RESIDUAL_CLEANUP_STRENGTH`, `videoCleanupBackends.js`). */
const RESIDUAL_CLEANUP_STRENGTH = 1.5;
/** Reference project defaults (`videoExport.js`): explicit bitrate over a generic quality preset. */
const VIDEO_BITRATE = 12_000_000;
const VIDEO_KEY_FRAME_INTERVAL = 2;
const VIDEO_COLOR_SPACE: VideoColorSpaceInit = Object.freeze({
  primaries: 'bt709',
  transfer: 'bt709',
  matrix: 'bt709',
  fullRange: false,
});

export interface GeminiVideoWatermarkResult {
  blob: Blob;
  found: boolean;
  width: number;
  height: number;
}

export interface GeminiVideoWatermarkOptions {
  signal?: AbortSignal;
  onProgress?: (ratio: number, label: string) => void;
}

type Canvas2dTarget = OffscreenCanvas | HTMLCanvasElement;
type Canvas2dContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function createRuntimeCanvas(width: number, height: number): Canvas2dTarget {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function get2dContext(canvas: Canvas2dTarget): Canvas2dContext {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Canvas2dContext | null;
  if (!ctx) throw new Error('Could not create a 2D canvas context for video processing.');
  return ctx;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function sampleTimestamps(duration: number, count: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const interval = duration / (count + 1);
  return Array.from({ length: count }, (_unused, index) => interval * (index + 1));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

interface DetectedCandidate {
  candidate: VideoWatermarkCandidate;
  alphaMap: Float32Array;
  /** A single gain, estimated once from the sampled frames, reused for the whole export. */
  seedGain: number;
}

/**
 * Votes across sampled frames for the single most consistent watermark candidate, then estimates
 * one seed alpha gain for the whole video: the median of that same candidate's per sample frame
 * gain estimate (`estimateAlphaSeedFromFrames` in the reference's `videoWatermarkDetector.js`),
 * discarding any sample where a different candidate won with real confidence.
 */
async function detectVideoWatermarkCandidate(
  videoTrack: InputVideoTrack,
  width: number,
  height: number,
  duration: number,
): Promise<DetectedCandidate | null> {
  const candidates = resolveVideoWatermarkCandidates(width, height);
  if (candidates.length === 0) return null;

  const canvas = createRuntimeCanvas(width, height);
  const ctx = get2dContext(canvas);
  const sink = new VideoSampleSink(videoTrack);
  const targets = sampleTimestamps(duration, DETECTION_SAMPLE_COUNT);

  const votes = new Map<string, number>();
  const confidenceSums = new Map<string, { sum: number; count: number }>();
  const alphaMapById = new Map<string, Float32Array>();
  const sampleFrames: { imageData: ImageData; winnerId: string | null; winnerConfidence: number }[] = [];
  let sampledCount = 0;

  for (const timestamp of targets) {
    const sample = await sink.getSample(timestamp);
    if (!sample) continue;
    try {
      sample.draw(ctx, 0, 0, width, height);
    } finally {
      sample.close();
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    let winnerId: string | null = null;
    let winnerConfidence = -Infinity;
    for (const candidate of candidates) {
      const scored = scoreCandidateOnFrame(imageData, candidate);
      alphaMapById.set(candidate.id, scored.alphaMap);
      const entry = confidenceSums.get(candidate.id) ?? { sum: 0, count: 0 };
      entry.sum += scored.confidence;
      entry.count += 1;
      confidenceSums.set(candidate.id, entry);
      if (scored.confidence > winnerConfidence) {
        winnerConfidence = scored.confidence;
        winnerId = candidate.id;
      }
    }
    if (winnerId) votes.set(winnerId, (votes.get(winnerId) ?? 0) + 1);
    sampleFrames.push({ imageData, winnerId, winnerConfidence });
    sampledCount += 1;
  }

  if (sampledCount === 0) return null;

  let bestId: string | null = null;
  let bestVotes = -1;
  for (const [id, count] of votes) {
    if (count > bestVotes) {
      bestVotes = count;
      bestId = id;
    }
  }
  if (!bestId) return null;

  const stats = confidenceSums.get(bestId);
  const meanConfidence = stats && stats.count > 0 ? stats.sum / stats.count : 0;
  const voteRatio = bestVotes / sampledCount;
  if (meanConfidence < MIN_MEAN_CONFIDENCE || voteRatio < MIN_VOTE_RATIO) return null;

  const candidate = candidates.find((entry) => entry.id === bestId);
  const alphaMap = alphaMapById.get(bestId);
  if (!candidate || !alphaMap) return null;

  const position = { x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height };
  const gainEstimates: number[] = [];
  for (const frame of sampleFrames) {
    if (frame.winnerId !== null && frame.winnerId !== bestId && frame.winnerConfidence > 0.08) continue;
    const gain = estimateFrameAlphaGain(frame.imageData, position, alphaMap);
    if (gain < 0.35 || gain > 1.35) continue;
    gainEstimates.push(gain);
  }
  const seedGain = median(gainEstimates) ?? 1;

  return { candidate, alphaMap, seedGain };
}

function canCopyAudioCodecToMp4(format: Mp4OutputFormat, codec: string | null): boolean {
  return Boolean(codec && format.getSupportedAudioCodecs().includes(codec as never));
}

interface PreparedAudioCopy {
  source: EncodedAudioPacketSource;
  audioTrack: import('mediabunny').InputAudioTrack;
  decoderConfig: AudioDecoderConfig | null;
}

/**
 * Adds the source audio track to the output, if any. Must run before `output.start()`, since a
 * track can only be added while the output is still pending. The actual packet copy has to wait
 * until after `start()`, when the output is ready to receive samples.
 */
async function prepareAudioCopy(input: Input, output: Output, format: Mp4OutputFormat): Promise<PreparedAudioCopy | null> {
  const audioTrack = await input.getPrimaryAudioTrack().catch(() => null);
  if (!audioTrack) return null;

  const codec = await audioTrack.getCodec().catch(() => null);
  if (!canCopyAudioCodecToMp4(format, codec)) return null;

  const source = new EncodedAudioPacketSource(codec!);
  output.addAudioTrack(source);
  const decoderConfig = await audioTrack.getDecoderConfig().catch(() => null);
  return { source, audioTrack, decoderConfig };
}

/**
 * Shifts a packet's timestamp so 0 lines up with the video's own start, dropping it if it ends
 * before that point. Container tracks routinely start a little before or after each other
 * (encoder priming, negative pts), and mediabunny rejects a negative output timestamp outright.
 */
function normalizePacketTimestamp(packet: EncodedPacket, startTimestamp: number): EncodedPacket | null {
  const shiftedTimestamp = packet.timestamp - startTimestamp;
  if (shiftedTimestamp >= 0) return packet;
  if (packet.timestamp + packet.duration <= startTimestamp) return null;
  return packet.clone({ timestamp: 0, duration: Math.max(0, packet.duration + shiftedTimestamp) });
}

/** Copies the source audio track's packets into the output as is; never re encoded. */
async function copyAudioPackets(prepared: PreparedAudioCopy | null, startTimestamp: number): Promise<void> {
  if (!prepared) return;
  const { source, audioTrack, decoderConfig } = prepared;

  const sink = new EncodedPacketSink(audioTrack);
  let first = true;
  try {
    for await (const packet of sink.packets()) {
      const normalized = normalizePacketTimestamp(packet, startTimestamp);
      if (!normalized) continue;
      await source.add(normalized, first ? { decoderConfig: decoderConfig ?? undefined } : undefined);
      first = false;
    }
  } finally {
    source.close();
  }
}

/** Stamps the reference project's fixed BT.709 limited range color space onto every encoded packet. */
function stampColorSpace(_packet: EncodedPacket, meta: EncodedVideoChunkMetadata | undefined): void {
  if (!meta?.decoderConfig) return;
  meta.decoderConfig.colorSpace = { ...VIDEO_COLOR_SPACE };
}

/**
 * Detects and removes the Gemini sparkle watermark from every frame of `file`, returning a new
 * MP4 with audio preserved. When no watermark clears the confidence gate, the video is
 * re encoded unchanged and `found` is false.
 */
export async function removeGeminiVideoWatermark(
  file: File,
  options: GeminiVideoWatermarkOptions = {},
): Promise<GeminiVideoWatermarkResult> {
  const { signal, onProgress } = options;
  const report = (ratio: number, label: string) => onProgress?.(Math.min(1, Math.max(0, ratio)), label);

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('This file has no video track to process.');

    const width = await videoTrack.getDisplayWidth();
    const height = await videoTrack.getDisplayHeight();
    const duration = await input.computeDuration();
    // The video track's own first timestamp, not the file's global minimum: an audio track
    // commonly starts a little before or after the video (encoder priming gives it a small
    // negative pts), and that's exactly what `normalizePacketTimestamp` below expects to see
    // and clamp — using the global minimum instead would make that same packet's shift equal
    // zero while its own raw timestamp field is still negative, which mediabunny rejects.
    const firstTimestamp = await videoTrack.getFirstTimestamp().catch(() => 0);
    throwIfAborted(signal);

    report(0.02, 'Reading the video');
    const detected = await detectVideoWatermarkCandidate(videoTrack, width, height, duration);
    throwIfAborted(signal);
    report(0.15, detected ? 'Watermark found' : 'No watermark found, copying video');

    const videoEncodingConfig = {
      codec: 'avc' as const,
      bitrate: VIDEO_BITRATE,
      alpha: 'discard' as const,
      keyFrameInterval: VIDEO_KEY_FRAME_INTERVAL,
      latencyMode: 'quality' as const,
      bitrateMode: 'constant' as const,
      hardwareAcceleration: 'no-preference' as const,
      contentHint: 'detail',
      onEncodedPacket: stampColorSpace,
    };
    const canEncodeAvc = await canEncodeVideo('avc', {
      width,
      height,
      bitrate: videoEncodingConfig.bitrate,
      latencyMode: videoEncodingConfig.latencyMode,
      bitrateMode: videoEncodingConfig.bitrateMode,
      hardwareAcceleration: videoEncodingConfig.hardwareAcceleration,
      contentHint: videoEncodingConfig.contentHint,
    });
    if (!canEncodeAvc) {
      throw new Error('This browser cannot encode H.264 video, try a recent Chrome or Edge.');
    }

    const canvas = createRuntimeCanvas(width, height);
    const ctx = get2dContext(canvas);
    const target = new BufferTarget();
    const format = new Mp4OutputFormat({ fastStart: 'in-memory' });
    const output = new Output({ format, target });
    const videoSource = new CanvasSource(canvas, videoEncodingConfig);
    output.addVideoTrack(videoSource);

    try {
      const preparedAudio = await prepareAudioCopy(input, output, format);
      await output.start();
      throwIfAborted(signal);
      const audioCopyPromise = copyAudioPackets(preparedAudio, firstTimestamp);

      const sink = new VideoSampleSink(videoTrack);
      let lastTimestamp = -Infinity;
      const fallbackDuration = 1 / 30;

      for await (const sample of sink.samples()) {
        throwIfAborted(signal);
        let timestamp = Math.max(0, sample.timestamp - firstTimestamp);
        if (timestamp < lastTimestamp) timestamp = lastTimestamp + fallbackDuration;
        const sampleDuration = Number.isFinite(sample.duration) && sample.duration > 0 ? sample.duration : fallbackDuration;

        try {
          sample.draw(ctx, 0, 0, width, height);
          if (detected) {
            const position = {
              x: detected.candidate.x,
              y: detected.candidate.y,
              width: detected.candidate.width,
              height: detected.candidate.height,
            };
            const frame = ctx.getImageData(0, 0, width, height);
            const frameScore = scoreCandidateOnFrame(frame, detected.candidate);
            if (frameScore.confidence >= FRAME_LOW_CONFIDENCE) {
              const restoredFrame = removeWatermarkFromFrameRegion(frame, position, detected.alphaMap, detected.seedGain);
              ctx.putImageData(restoredFrame, 0, 0);
              applySoftResidualCleanup(ctx, position, detected.alphaMap, RESIDUAL_CLEANUP_STRENGTH);
            }
          }
        } finally {
          sample.close();
        }

        await videoSource.add(timestamp, sampleDuration);
        lastTimestamp = timestamp;

        const timeProgress = duration > 0 ? Math.min(1, (timestamp + sampleDuration) / duration) : 0;
        report(0.15 + 0.83 * timeProgress, 'Removing watermark');
      }

      videoSource.close();
      await audioCopyPromise;
      await output.finalize();
      throwIfAborted(signal);

      if (!target.buffer) throw new Error('Video export produced no output.');

      report(1, 'Done');
      return { blob: new Blob([target.buffer], { type: 'video/mp4' }), found: detected !== null, width, height };
    } catch (error) {
      if (output.state !== 'finalized' && output.state !== 'canceled') {
        await output.cancel().catch(() => undefined);
      }
      throw error;
    }
  } finally {
    input.dispose();
  }
}
