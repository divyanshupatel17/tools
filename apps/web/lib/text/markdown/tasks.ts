/**
 * Toggles the checkbox on one specific line of Markdown source, given the line number the
 * render engine reported for that task item (`MarkdownRenderResult.task_lines[index]`). Kept as
 * a plain string operation rather than a full parse so the Preview panel's checkbox click can
 * round trip straight back into the Markdown Input textarea with no re-parse of the whole
 * document, and no risk of a second implementation drifting out of sync with the renderer's own
 * notion of "task item".
 */
export function toggleTaskLine(source: string, lineNumber: number): string {
  const lines = source.split('\n');
  const line = lines[lineNumber];
  if (line === undefined) return source;

  if (/\[ \]/.test(line)) {
    lines[lineNumber] = line.replace('[ ]', '[x]');
  } else if (/\[x\]/i.test(line)) {
    lines[lineNumber] = line.replace(/\[x\]/i, '[ ]');
  } else {
    return source;
  }

  return lines.join('\n');
}
