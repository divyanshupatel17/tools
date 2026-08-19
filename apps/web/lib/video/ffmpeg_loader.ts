import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { assetPath } from '@/lib/utils/asset_path';

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

/**
 * Loads FFmpeg's WASM core once per browser session and reuses it across every video tool.
 * The core is self hosted from `public/ffmpeg/` (copied from `@ffmpeg/core` at install time,
 * see docs/video_tools.md) so nothing is fetched from a third party CDN — only the ~30 MB
 * decoder itself, never the user's file.
 */
export async function loadFFmpeg(onLog?: (message: string) => void): Promise<FFmpeg> {
  if (instance) return instance;
  if (!loading) {
    loading = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);
      const ffmpeg = new FFmpeg();
      if (onLog) ffmpeg.on('log', ({ message }) => onLog(message));

      const base = assetPath('/ffmpeg');
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      ]);
      await ffmpeg.load({ coreURL, wasmURL });
      instance = ffmpeg;
      return ffmpeg;
    })().catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

/** Terminates the loaded core and forgets it; the next `loadFFmpeg()` call starts fresh. */
export function resetFFmpeg(): void {
  instance?.terminate();
  instance = null;
  loading = null;
}
