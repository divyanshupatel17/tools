import { describe, expect, it } from 'vitest';
import { buildResizeCropArgs } from '@/features/video/resize_crop_video/processor';

describe('buildResizeCropArgs', () => {
  it('builds a scale filter for resize mode', () => {
    const args = buildResizeCropArgs({ mode: 'resize', width: 1280, height: 720 }, 'in.mp4', 'out.mp4');
    expect(args).toContain('-vf');
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=1280:720:flags=lanczos');
  });

  it('rounds an odd resize target down to the nearest even number', () => {
    const args = buildResizeCropArgs({ mode: 'resize', width: 1281, height: 721 }, 'in.mp4', 'out.mp4');
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=1282:722:flags=lanczos');
  });

  it('builds a crop filter with width:height:x:y order', () => {
    const args = buildResizeCropArgs(
      { mode: 'crop', crop_width: 600, crop_height: 600, crop_x: 100, crop_y: 40 },
      'in.mp4',
      'out.mp4',
    );
    expect(args[args.indexOf('-vf') + 1]).toBe('crop=600:600:100:40');
  });

  it('never emits a negative crop offset', () => {
    const args = buildResizeCropArgs(
      { mode: 'crop', crop_width: 400, crop_height: 400, crop_x: -5, crop_y: -5 },
      'in.mp4',
      'out.mp4',
    );
    expect(args[args.indexOf('-vf') + 1]).toBe('crop=400:400:0:0');
  });

  it('allows an upscale target larger than any real source, with lanczos resampling', () => {
    const args = buildResizeCropArgs({ mode: 'resize', width: 3840, height: 2160 }, 'in.mp4', 'out.mp4');
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=3840:2160:flags=lanczos');
  });

  it('copies the audio stream instead of re-encoding it', () => {
    const args = buildResizeCropArgs({ mode: 'resize', width: 640, height: 360 }, 'in.mp4', 'out.mp4');
    expect(args[args.indexOf('-c:a') + 1]).toBe('copy');
  });
});
