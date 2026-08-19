/**
 * Samples evenly spaced frames from a video into small JPEG data URLs, entirely in the browser
 * (no FFmpeg involved — a hidden `<video>` plus seeking is far cheaper for a filmstrip preview).
 * Sequential by design: seeking is what's slow, and doing it one frame at a time is what makes
 * `onseeked` fire reliably instead of racing itself.
 */
export function generateFilmstrip(
  file: File,
  duration: number,
  count: number,
  height = 64,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!Number.isFinite(duration) || duration <= 0 || count <= 0) {
      resolve([]);
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const canvas = document.createElement('canvas');
    let ctx: CanvasRenderingContext2D | null = null;
    const frames: string[] = [];
    let index = 0;
    let settled = false;

    function cleanup() {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    }

    function finish(value: string[]) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error('Could not read frames from this video.'));
    }

    function captureNext() {
      if (index >= count) {
        finish(frames);
        return;
      }
      const time = Math.min(Math.max(0, duration - 0.05), (index / Math.max(1, count - 1)) * duration);
      video.currentTime = time;
    }

    video.onloadedmetadata = () => {
      const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
      canvas.width = Math.max(1, Math.round(height * aspect));
      canvas.height = height;
      ctx = canvas.getContext('2d');
      if (!ctx) {
        fail(new Error('Canvas is not available.'));
        return;
      }
      captureNext();
    };
    video.onseeked = () => {
      if (ctx) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', 0.6));
        } catch {
          // A frame that fails to draw (e.g. a transient decode hiccup) is skipped, not fatal.
        }
      }
      index += 1;
      captureNext();
    };
    video.onerror = () => fail(new Error('That file could not be read as a video.'));

    video.src = url;
  });
}
