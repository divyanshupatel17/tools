import { describe, expect, it } from 'vitest';
import { codecForExtension } from '@/features/audio/reverse_audio/formats';
import { buildReverseArgs, type ReverseAudioOptions } from '@/features/audio/reverse_audio/processor';
import { encodeWavFromChannels, reverseChannels } from '@/features/audio/reverse_audio/preview';

const baseOptions: ReverseAudioOptions = { bitrate_kbps: 160 };

describe('buildReverseArgs', () => {
  it('applies the areverse filter and the source codec', () => {
    const args = buildReverseArgs(baseOptions, 'mp3', 'in.mp3', 'out.mp3');
    expect(args).toContain('-af');
    expect(args[args.indexOf('-af') + 1]).toBe('areverse');
    expect(args).toContain('libmp3lame');
    expect(args).toContain('-b:a');
  });

  it('omits -b:a for a lossless codec', () => {
    const args = buildReverseArgs(baseOptions, 'wav', 'in.wav', 'out.wav');
    expect(args).not.toContain('-b:a');
    expect(args).toContain('pcm_s16le');
  });
});

describe('codecForExtension', () => {
  it('keeps recognised containers in their own format', () => {
    expect(codecForExtension('flac').extension).toBe('flac');
    expect(codecForExtension('m4a').extension).toBe('m4a');
  });

  it('falls back to mp3 for anything unrecognised', () => {
    expect(codecForExtension('wma').extension).toBe('mp3');
  });
});

describe('reverseChannels', () => {
  function makeBuffer(channels: number[][]): AudioBuffer {
    const length = channels[0]?.length ?? 0;
    return {
      numberOfChannels: channels.length,
      length,
      sampleRate: 48000,
      duration: length / 48000,
      getChannelData: (index: number) => Float32Array.from(channels[index] ?? []),
    } as unknown as AudioBuffer;
  }

  it('reverses sample order per channel without mutating input order semantics', () => {
    const buffer = makeBuffer([[0, 0.25, 0.5, 1]]);
    const reversed = reverseChannels(buffer);
    expect(Array.from(reversed[0] ?? [])).toEqual([1, 0.5, 0.25, 0]);
  });

  it('reverses every channel independently for multi channel audio', () => {
    const buffer = makeBuffer([
      [0, 1, 2],
      [10, 11, 12],
    ]);
    const reversed = reverseChannels(buffer);
    expect(Array.from(reversed[0] ?? [])).toEqual([2, 1, 0]);
    expect(Array.from(reversed[1] ?? [])).toEqual([12, 11, 10]);
  });
});

describe('encodeWavFromChannels', () => {
  it('produces a WAV blob with a 44 byte header plus 16 bit PCM data', async () => {
    const channel = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const blob = encodeWavFromChannels([channel], 44100);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + channel.length * 2);

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const readString = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(buffer, offset, length));
    expect(readString(0, 4)).toBe('RIFF');
    expect(readString(8, 4)).toBe('WAVE');
    expect(view.getUint32(24, true)).toBe(44100);
  });
});
