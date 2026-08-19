import { describe, expect, it } from 'vitest';
import { buildVoiceRecorderArgs, type VoiceRecorderOptions } from '@/features/audio/voice_recorder/processor';
import { extensionForMimeType, QUALITY_PRESETS } from '@/features/audio/voice_recorder/formats';
import { encodeWavFromChannels } from '@/features/audio/voice_recorder/wav';

const baseOptions: VoiceRecorderOptions = { bitrate_kbps: 128, sample_rate: 44100, channels: 1 };

describe('buildVoiceRecorderArgs', () => {
  it('always encodes to MP3 with the requested sample rate, channels and bitrate', () => {
    const args = buildVoiceRecorderArgs(baseOptions, 'in.webm', 'output.mp3');
    expect(args).toEqual([
      '-i',
      'in.webm',
      '-ar',
      '44100',
      '-ac',
      '1',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      'output.mp3',
    ]);
  });

  it('clamps bitrate to the 32..320 kbps range', () => {
    const tooLow = buildVoiceRecorderArgs({ ...baseOptions, bitrate_kbps: 8 }, 'in.webm', 'out.mp3');
    expect(tooLow[tooLow.indexOf('-b:a') + 1]).toBe('32k');

    const tooHigh = buildVoiceRecorderArgs({ ...baseOptions, bitrate_kbps: 999 }, 'in.webm', 'out.mp3');
    expect(tooHigh[tooHigh.indexOf('-b:a') + 1]).toBe('320k');
  });

  it('coerces channels to 1 or 2', () => {
    const stereo = buildVoiceRecorderArgs({ ...baseOptions, channels: 2 }, 'in.webm', 'out.mp3');
    expect(stereo[stereo.indexOf('-ac') + 1]).toBe('2');
  });
});

describe('extensionForMimeType', () => {
  it('maps known capture containers to a matching extension', () => {
    expect(extensionForMimeType('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionForMimeType('audio/mp4')).toBe('m4a');
    expect(extensionForMimeType('audio/ogg;codecs=opus')).toBe('ogg');
  });

  it('falls back to webm for an unrecognised type', () => {
    expect(extensionForMimeType('audio/x-mystery')).toBe('webm');
  });
});

describe('QUALITY_PRESETS', () => {
  it('is ordered from lowest to highest bitrate', () => {
    const kbpsValues = QUALITY_PRESETS.map((preset) => preset.kbps);
    expect(kbpsValues).toEqual([...kbpsValues].sort((a, b) => a - b));
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
