import { describe, expect, it } from 'vitest';
import { CONVERT_VIDEO_FORMATS, isAudioFormat } from '@/features/video/convert_video/formats';
import {
  buildConvertArgs,
  buildPreviewArgs,
  convertOutputFileName,
} from '@/features/video/convert_video/processor';

describe('buildConvertArgs', () => {
  it('builds a video codec pair for a container target', () => {
    const args = buildConvertArgs('mp4', 'in.mov', 'out.mp4');
    expect(args).toEqual([
      '-i',
      'in.mov',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      'out.mp4',
    ]);
  });

  it('drops the video stream with -vn for an audio only target', () => {
    const args = buildConvertArgs('mp3', 'in.mp4', 'out.mp3');
    expect(args).toContain('-vn');
    expect(args).not.toContain('-c:v');
  });

  it('adds an explicit -f where the extension cannot be guessed as the right muxer', () => {
    const args = buildConvertArgs('m4r', 'in.mp4', 'out.m4r');
    expect(args[args.indexOf('-f') + 1]).toBe('mp4');
  });

  it('builds a palette based filter graph for GIF, with no audio and a capped duration', () => {
    const args = buildConvertArgs('gif', 'in.mp4', 'out.gif');
    expect(args).toContain('-an');
    expect(args).toContain('-filter_complex');
    expect(args[args.indexOf('-t') + 1]).toBe('20');
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain('palettegen');
    expect(filter).toContain('paletteuse');
  });

  it.each(CONVERT_VIDEO_FORMATS)('produces a runnable arg list for every format (%s)', (format) => {
    const args = buildConvertArgs(format, 'in.mp4', `out.${format}`);
    expect(args).toContain('-i');
    expect(args[args.length - 1]).toContain(`out.${format}`);
  });
});

describe('buildPreviewArgs', () => {
  it('remuxes with -c copy, touching no pixel or sample', () => {
    const args = buildPreviewArgs('remux', false, 'out.ts', 'preview.mp4');
    expect(args).toEqual(['-i', 'out.ts', '-c', 'copy', '-movflags', '+faststart', 'preview.mp4']);
  });

  it('transcodes audio to mp3 for formats no browser can decode', () => {
    const args = buildPreviewArgs('transcode', true, 'out.wma', 'preview.mp3');
    expect(args).toContain('libmp3lame');
    expect(args).not.toContain('-c:v');
  });

  it('transcodes video to a small fast h264/aac mp4', () => {
    const args = buildPreviewArgs('transcode', false, 'out.avi', 'preview.mp4');
    expect(args).toContain('libx264');
    expect(args).toContain('ultrafast');
    expect(args).toContain('-c:a');
  });
});

describe('convertOutputFileName', () => {
  it('swaps the extension to match the chosen format', () => {
    expect(convertOutputFileName('clip.mov', 'webm')).toBe('clip.webm');
    expect(convertOutputFileName('clip.mov', 'mp3')).toBe('clip.mp3');
    expect(convertOutputFileName('clip.mov', 'mpeg')).toBe('clip.mpg');
  });
});

describe('isAudioFormat', () => {
  it('separates audio only targets from video containers', () => {
    expect(isAudioFormat('mp3')).toBe(true);
    expect(isAudioFormat('m4r')).toBe(true);
    expect(isAudioFormat('mp4')).toBe(false);
    expect(isAudioFormat('gif')).toBe(false);
  });
});
