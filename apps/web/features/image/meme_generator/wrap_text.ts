/** Breaks a single word that is wider than `maxWidth` on its own into character chunks. */
function breakLongWord(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  word: string,
  maxWidth: number,
): string[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const char of word) {
    const candidate = chunk + char;
    if (chunk && ctx.measureText(candidate).width > maxWidth) {
      chunks.push(chunk);
      chunk = char;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

/**
 * Wraps `text` to fit `maxWidth`, measured with the context's current font. Real word wrapping
 * against `measureText`, not a fixed character count: a caption that would otherwise run off the
 * image breaks onto as many lines as it needs, and a single word wider than the image breaks by
 * character rather than overflowing.
 */
export function wrapText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const pieces =
        ctx.measureText(word).width > maxWidth ? breakLongWord(ctx, word, maxWidth) : [word];
      for (const piece of pieces) {
        const candidate = current ? `${current} ${piece}` : piece;
        if (current && ctx.measureText(candidate).width > maxWidth) {
          lines.push(current);
          current = piece;
        } else {
          current = candidate;
        }
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}
