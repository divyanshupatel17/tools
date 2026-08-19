import type { FileRule } from '@tools/file_utils';

/** Containers every video tool accepts as input. Output is always MP4 (h264 + aac). */
export const VIDEO_EXTENSIONS = [
  'mp4',
  'webm',
  'mov',
  'avi',
  'mkv',
  'flv',
  'wmv',
  'mpeg',
  'mpg',
  'ogv',
  '3gp',
  'ts',
  'm2ts',
  'mts',
] as const;

export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/x-flv',
  'video/x-ms-wmv',
  'video/mpeg',
  'video/ogg',
  'video/3gpp',
  'video/mp2t',
] as const;

/** `accept` string for a file input covering every container this tool set reads. */
export const VIDEO_ACCEPT = [
  ...VIDEO_MIME_TYPES,
  ...VIDEO_EXTENSIONS.map((extension) => `.${extension}`),
].join(',');

/** Builds a FileRule for @tools/file_utils covering every container a video tool reads. */
export function videoRule(options?: { max_files?: number; max_bytes?: number }): FileRule {
  return {
    extensions: [...VIDEO_EXTENSIONS],
    max_files: options?.max_files ?? 1,
    max_bytes: options?.max_bytes ?? 500 * 1024 * 1024,
  };
}

export interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}

/**
 * Reads duration and dimensions from the browser's own decoder, no FFmpeg involved. Used to
 * seed the live preview and the target size math before the user ever clicks run.
 */
export function readVideoMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    function finish(duration: number) {
      const meta: VideoMeta = { duration, width: video.videoWidth, height: video.videoHeight };
      URL.revokeObjectURL(url);
      resolve(meta);
    }

    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        finish(video.duration);
        return;
      }
      // A raw MediaRecorder WebM (the Screen & Camera Recorder's own output, before any FFmpeg
      // pass touches it) has no duration in its container header — Chrome reports Infinity until
      // forced to seek near the end, at which point it clamps and finally knows the real length.
      const onTimeUpdate = () => {
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.currentTime = 0;
        finish(Number.isFinite(video.duration) ? video.duration : 0);
      };
      video.addEventListener('timeupdate', onTimeUpdate);
      video.currentTime = 1e10;
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as a video.'));
    };
    video.src = url;
  });
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
