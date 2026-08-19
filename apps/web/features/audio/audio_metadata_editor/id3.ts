import { fetchFile } from '@ffmpeg/util';
import { fileExtension } from '@tools/file_utils';
import { loadFFmpeg } from '@/lib/video/ffmpeg_loader';

export interface AudioTagFields {
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: string;
  track: string;
  track_total: string;
  comment: string;
  composer: string;
  copyright: string;
}

export interface AudioProbe {
  format_name: string;
  bitrate_kbps: number | null;
  sample_rate: number | null;
  channels: number | null;
  tags: AudioTagFields;
  /** Absolute ffmpeg stream index of the embedded cover art, if any (`disposition.attached_pic`). */
  artwork_stream_index: number | null;
  artwork_codec: string | null;
}

interface ProbeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  sample_rate?: string;
  channels?: number;
  disposition?: { attached_pic?: number };
}

interface ProbeResult {
  format?: { format_name?: string; bit_rate?: string; tags?: Record<string, string> };
  streams?: ProbeStream[];
}

const EMPTY_TAGS: AudioTagFields = {
  title: '',
  artist: '',
  album: '',
  genre: '',
  year: '',
  track: '',
  track_total: '',
  comment: '',
  composer: '',
  copyright: '',
};

/** ffprobe's tag casing varies by container (`title` for MP3/ID3v2, `TITLE` for some others), so
 *  every lookup is case insensitive. */
function readTag(tags: Record<string, string> | undefined, ...keys: string[]): string {
  if (!tags) return '';
  const lowered = new Map(Object.entries(tags).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) {
    const value = lowered.get(key.toLowerCase());
    if (value !== undefined) return value;
  }
  return '';
}

/** Splits a `TRCK` style "N/Total" value; a bare "N" leaves total empty. */
function splitTrack(value: string): { track: string; total: string } {
  const [track, total] = value.split('/').map((part) => part.trim());
  return { track: track ?? '', total: total ?? '' };
}

const CODEC_TO_EXTENSION: Record<string, string> = {
  mjpeg: 'jpg',
  png: 'png',
  gif: 'gif',
};

let counter = 0;

/** Reads container, bitrate and ID3 style tags via ffmpeg's own ffprobe, and locates an embedded
 *  cover art stream if one exists. Runs entirely in the browser. */
export async function probeAudioTags(file: File): Promise<AudioProbe> {
  const ffmpeg = await loadFFmpeg();
  const extension = fileExtension(file.name) || 'mp3';
  const id = (counter += 1);
  const inputName = `tagprobe_${id}.${extension}`;
  const outputName = `tagprobe_${id}.json`;

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

    const audioStream = data.streams?.find((stream) => stream.codec_type === 'audio');
    const artworkStream = data.streams?.find(
      (stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic === 1,
    );

    const tags = data.format?.tags;
    const { track, total } = splitTrack(readTag(tags, 'track'));

    return {
      format_name: (data.format?.format_name ?? extension).split(',')[0] ?? extension,
      bitrate_kbps: data.format?.bit_rate ? Math.round(Number(data.format.bit_rate) / 1000) : null,
      sample_rate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : null,
      channels: audioStream?.channels ?? null,
      tags: {
        title: readTag(tags, 'title'),
        artist: readTag(tags, 'artist'),
        album: readTag(tags, 'album'),
        genre: readTag(tags, 'genre'),
        year: readTag(tags, 'date', 'year'),
        track,
        track_total: total,
        comment: readTag(tags, 'comment'),
        composer: readTag(tags, 'composer'),
        copyright: readTag(tags, 'copyright'),
      },
      artwork_stream_index: artworkStream?.index ?? null,
      artwork_codec: artworkStream?.codec_name ?? null,
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

export { EMPTY_TAGS };

/** Extracts the embedded cover art stream as its own file, unmodified (`-c copy`). */
export async function extractArtwork(
  file: File,
  streamIndex: number,
  codec: string | null,
): Promise<Blob | null> {
  const ffmpeg = await loadFFmpeg();
  const extension = fileExtension(file.name) || 'mp3';
  const id = (counter += 1);
  const inputName = `artwork_in_${id}.${extension}`;
  const artExtension = (codec && CODEC_TO_EXTENSION[codec]) || 'jpg';
  const outputName = `artwork_out_${id}.${artExtension}`;

  await ffmpeg.writeFile(inputName, await fetchFile(file));
  try {
    const code = await ffmpeg.exec(['-i', inputName, '-map', `0:${streamIndex}`, '-c', 'copy', outputName]);
    if (code !== 0) return null;
    const data = await ffmpeg.readFile(outputName);
    return new Blob([new Uint8Array(data as Uint8Array)], { type: `image/${artExtension === 'jpg' ? 'jpeg' : artExtension}` });
  } catch {
    return null;
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch {
      // Best effort cleanup.
    }
  }
}
