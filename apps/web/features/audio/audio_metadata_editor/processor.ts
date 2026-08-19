import { fetchFile } from '@ffmpeg/util';
import { fileExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { audioRule } from '@/lib/audio/audio_formats';
import type { AudioTagFields } from './id3';

export type ArtworkAction = 'keep' | 'remove' | 'replace';

export interface AudioMetadataOptions extends AudioTagFields {
  artwork_action: ArtworkAction;
}

const RULE = audioRule();

/** Every field maps straight to a standard ffmpeg metadata key; empty strings are intentional —
 *  `-metadata key=` deletes that tag, which is exactly what a cleared field should do. */
export function buildMetadataArgs(
  options: AudioMetadataOptions,
  inputName: string,
  artworkName: string | null,
  outputName: string,
): string[] {
  const args = ['-i', inputName];
  if (options.artwork_action === 'replace' && artworkName) args.push('-i', artworkName);

  args.push('-map', '0:a');
  if (options.artwork_action === 'replace' && artworkName) {
    args.push('-map', '1');
  } else if (options.artwork_action === 'keep') {
    // `?` makes the mapping optional: if the source never had a cover stream this simply matches
    // nothing instead of failing the whole export.
    args.push('-map', '0:v?');
  }

  args.push('-c', 'copy', '-id3v2_version', '3');

  const track = options.track_total ? `${options.track}/${options.track_total}` : options.track;
  args.push(
    '-metadata',
    `title=${options.title}`,
    '-metadata',
    `artist=${options.artist}`,
    '-metadata',
    `album=${options.album}`,
    '-metadata',
    `genre=${options.genre}`,
    '-metadata',
    `date=${options.year}`,
    '-metadata',
    `track=${track}`,
    '-metadata',
    `comment=${options.comment}`,
    '-metadata',
    `composer=${options.composer}`,
    '-metadata',
    `copyright=${options.copyright}`,
  );

  if (options.artwork_action !== 'remove') {
    args.push(
      '-disposition:v',
      'attached_pic',
      '-metadata:s:v',
      'title=Album cover',
      '-metadata:s:v',
      'comment=Cover (front)',
    );
  }

  args.push(outputName);
  return args;
}

const audioMetadataEditor: ToolProcessor<AudioMetadataOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const file = files[0];
  if (!file) throw new ProcessorError('audio_metadata_invalid_input', 'Choose an audio file first.');
  // Only the audio file goes through the audio file rule; a second, optional file is artwork
  // (an image), which naturally fails an audio extension check and isn't meant to pass one.
  const check = validateFiles([file], RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'audio_metadata_invalid_input',
      check.errors[0] ?? 'That file could not be used.',
    );
  }
  const artworkFile = options.artwork_action === 'replace' ? files[1] : undefined;
  if (options.artwork_action === 'replace' && !artworkFile) {
    throw new ProcessorError('audio_metadata_invalid_input', 'Choose an artwork image first.');
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing the audio engine' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.1, label: 'Writing tags' });

  const extension = fileExtension(file.name) || 'mp3';
  const inputName = `input.${extension}`;
  const outputName = `output.${extension}`;
  const artworkExtension = artworkFile ? fileExtension(artworkFile.name) || 'jpg' : null;
  const artworkName = artworkExtension ? `cover.${artworkExtension}` : null;

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    if (artworkFile && artworkName) {
      await ffmpeg.writeFile(artworkName, await fetchFile(artworkFile), { signal });
    }
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const code = await ffmpeg.exec(
      buildMetadataArgs(options, inputName, artworkName, outputName),
      -1,
      { signal },
    );
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      resetFFmpeg();
      throw new ProcessorError(
        'audio_metadata_failed',
        'This file could not be processed in your browser.',
      );
    }

    on_progress?.({ ratio: 0.9, label: 'Finishing' });
    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: file.type || 'audio/mpeg' });

    const output: ProcessorOutput = {
      artifacts: [{ file_name: file.name, mime_type: blob.type, blob }],
    };
    return output;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!(error instanceof ProcessorError)) resetFFmpeg();
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError(
      'audio_metadata_failed',
      'This file could not be processed in your browser.',
      { cause: error },
    );
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
      if (artworkName) await ffmpeg.deleteFile(artworkName);
    } catch {
      // Best effort cleanup; a missing file here never affects the result already returned.
    }
  }
};

export default audioMetadataEditor;
