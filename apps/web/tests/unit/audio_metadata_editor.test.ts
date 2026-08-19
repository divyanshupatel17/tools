import { describe, expect, it } from 'vitest';
import { buildMetadataArgs } from '@/features/audio/audio_metadata_editor/processor';
import { EMPTY_TAGS } from '@/features/audio/audio_metadata_editor/id3';

const baseFields = {
  ...EMPTY_TAGS,
  title: 'Lo-fi Chill Beats',
  artist: 'Chillhop Music',
  album: 'Lo-fi Essentials',
  genre: 'Lo-fi',
  year: '2024',
  track: '1',
  track_total: '12',
  comment: 'Relaxing lo-fi beats for focus, study and chill.',
  composer: 'Chillhop Music',
  copyright: '© 2024 Chillhop Music. All rights reserved.',
};

describe('buildMetadataArgs', () => {
  it('always stream copies audio so quality and format never change', () => {
    const args = buildMetadataArgs({ ...baseFields, artwork_action: 'keep' }, 'in.mp3', null, 'out.mp3');
    expect(args).toContain('-c');
    expect(args[args.indexOf('-c') + 1]).toBe('copy');
  });

  it('writes every tag field as its own -metadata flag', () => {
    const args = buildMetadataArgs({ ...baseFields, artwork_action: 'keep' }, 'in.mp3', null, 'out.mp3');
    expect(args[args.indexOf('-metadata') + 1]).toBe('title=Lo-fi Chill Beats');
    expect(args).toContain('artist=Chillhop Music');
    expect(args).toContain('album=Lo-fi Essentials');
    expect(args).toContain('genre=Lo-fi');
    expect(args).toContain('date=2024');
    expect(args).toContain('track=1/12');
    expect(args).toContain('comment=Relaxing lo-fi beats for focus, study and chill.');
    expect(args).toContain('composer=Chillhop Music');
    expect(args).toContain('copyright=© 2024 Chillhop Music. All rights reserved.');
  });

  it('omits the track total slash when there is no total', () => {
    const args = buildMetadataArgs(
      { ...baseFields, track: '5', track_total: '', artwork_action: 'keep' },
      'in.mp3',
      null,
      'out.mp3',
    );
    expect(args).toContain('track=5');
  });

  it('an empty field clears that tag rather than being skipped', () => {
    const args = buildMetadataArgs({ ...baseFields, genre: '', artwork_action: 'keep' }, 'in.mp3', null, 'out.mp3');
    expect(args).toContain('genre=');
  });

  it('maps only the audio stream and optionally the source cover when keeping artwork', () => {
    const args = buildMetadataArgs({ ...baseFields, artwork_action: 'keep' }, 'in.mp3', null, 'out.mp3');
    expect(args).toContain('0:a');
    expect(args).toContain('0:v?');
    expect(args).not.toContain('1');
  });

  it('maps the second input as the new cover when replacing artwork', () => {
    const args = buildMetadataArgs(
      { ...baseFields, artwork_action: 'replace' },
      'in.mp3',
      'cover.jpg',
      'out.mp3',
    );
    expect(args).toContain('-i');
    expect(args[args.indexOf('-i') + 1]).toBe('in.mp3');
    expect(args).toContain('cover.jpg');
    expect(args).toContain('1');
    expect(args).toContain('attached_pic');
  });

  it('maps neither video stream when removing artwork', () => {
    const args = buildMetadataArgs({ ...baseFields, artwork_action: 'remove' }, 'in.mp3', null, 'out.mp3');
    expect(args).not.toContain('0:v?');
    expect(args).not.toContain('attached_pic');
  });
});
