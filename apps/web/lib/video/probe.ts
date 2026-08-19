import { fetchFile } from '@ffmpeg/util';
import { fileExtension } from '@tools/file_utils';
import { loadFFmpeg } from './ffmpeg_loader';

export interface VideoProbe {
  container: string;
  duration: number;
  bitrate_kbps: number | null;
  video_codec: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  frame_count: number | null;
  audio_codec: string | null;
  audio_bitrate_kbps: number | null;
  sample_rate: number | null;
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  nb_frames?: string;
  bit_rate?: string;
  sample_rate?: string;
}

interface ProbeResult {
  format?: { duration?: string; bit_rate?: string; format_name?: string };
  streams?: ProbeStream[];
}

function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null;
  const [num, den] = value.split('/').map(Number);
  if (!num) return null;
  if (!den) return Math.round(num * 100) / 100;
  return Math.round((num / den) * 100) / 100;
}

/**
 * ffprobe reports a container as a comma separated list of every format it could also be, e.g.
 * `mov,mp4,m4a,3gp,3g2,mj2` for anything in the ISO base media family. The first entry is
 * whichever demuxer happened to match first, not the format a person uploaded, so MP4 files
 * routinely come back labelled "mov". Prefer the most recognisable name in the list instead.
 */
function containerLabel(formatName: string | undefined): string {
  if (!formatName) return 'unknown';
  const names = formatName.split(',');
  const preferred = ['mp4', 'webm', 'matroska', 'mov', 'avi', 'flv', 'asf', 'mpeg', 'ogg', '3gp'];
  for (const name of preferred) {
    if (names.includes(name)) return name;
  }
  return names[0] ?? 'unknown';
}

let counter = 0;

/**
 * Reads real container, codec, frame rate and bitrate details via FFmpeg's own ffprobe, run
 * entirely in the browser. Slower than the browser's native `<video>` metadata (duration,
 * width, height) but that native API cannot report fps, codec or bitrate at all.
 */
export async function probeVideo(file: File | Blob): Promise<VideoProbe> {
  const ffmpeg = await loadFFmpeg();
  const extension = file instanceof File ? fileExtension(file.name) || 'mp4' : 'mp4';
  const id = (counter += 1);
  const inputName = `probe_${id}.${extension}`;
  const outputName = `probe_${id}.json`;

  await ffmpeg.writeFile(inputName, await fetchFile(file));
  try {
    await ffmpeg.ffprobe([
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      inputName,
      '-o',
      outputName,
    ]);
    const raw = await ffmpeg.readFile(outputName);
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    const data = JSON.parse(text) as ProbeResult;

    const video = data.streams?.find((stream) => stream.codec_type === 'video');
    const audio = data.streams?.find((stream) => stream.codec_type === 'audio');
    const duration = Number(data.format?.duration ?? 0) || 0;
    const fps = parseFrameRate(video?.r_frame_rate);
    const frameCount =
      video?.nb_frames && video.nb_frames !== 'N/A'
        ? Number(video.nb_frames)
        : fps && duration
          ? Math.round(fps * duration)
          : null;

    return {
      container: containerLabel(data.format?.format_name),
      duration,
      bitrate_kbps: data.format?.bit_rate ? Math.round(Number(data.format.bit_rate) / 1000) : null,
      video_codec: video?.codec_name ?? null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      fps,
      frame_count: frameCount,
      audio_codec: audio?.codec_name ?? null,
      audio_bitrate_kbps: audio?.bit_rate ? Math.round(Number(audio.bit_rate) / 1000) : null,
      sample_rate: audio?.sample_rate ? Number(audio.sample_rate) : null,
    };
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch {
      // Best effort cleanup; a leftover probe file never affects the next call's own names.
    }
  }
}
