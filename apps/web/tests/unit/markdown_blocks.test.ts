import { describe, expect, it } from 'vitest';
import { parseMarkdownToBlocks } from '@/lib/pdf/markdown_blocks';
import { parseInlineMarkdown } from '@/lib/pdf/markdown_inline';

describe('parseInlineMarkdown', () => {
  it('resolves bold, italic, bold italic, strikethrough, code and links', () => {
    expect(parseInlineMarkdown('**Bold**')).toEqual([{ text: 'Bold', bold: true }]);
    expect(parseInlineMarkdown('*Italic*')).toEqual([{ text: 'Italic', italic: true }]);
    expect(parseInlineMarkdown('***Bold Italic***')).toEqual([
      { text: 'Bold Italic', bold: true, italic: true },
    ]);
    expect(parseInlineMarkdown('~~Strikethrough~~')).toEqual([
      { text: 'Strikethrough', strikethrough: true },
    ]);
    expect(parseInlineMarkdown('`Inline code`')).toEqual([{ text: 'Inline code', mono: true }]);
    expect(parseInlineMarkdown('[Link](https://example.com)')).toEqual([
      { text: 'Link', link: 'https://example.com' },
    ]);
  });
});

describe('parseMarkdownToBlocks', () => {
  it('parses a horizontal rule as its own block', () => {
    const blocks = parseMarkdownToBlocks('Above\n\n---\n\nBelow');
    expect(blocks.some((block) => block.type === 'hr')).toBe(true);
  });

  it('parses a blockquote as its own block, not a paragraph', () => {
    const blocks = parseMarkdownToBlocks('> Blockquote');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('blockquote');
    if (blocks[0]!.type === 'blockquote') {
      expect(blocks[0]!.lines[0]).toEqual([{ text: 'Blockquote' }]);
    }
  });

  it('parses the full formatting sample without swallowing the hr or blockquote into a paragraph', () => {
    const source = [
      '## Text Formatting',
      '',
      '**Bold**  ',
      '*Italic*  ',
      '***Bold Italic***  ',
      '~~Strikethrough~~  ',
      '`Inline code`  ',
      '[Link](https://example.com)',
      '',
      '> Blockquote',
      '',
      '---',
    ].join('\n');

    const blocks = parseMarkdownToBlocks(source);
    const types = blocks.map((block) => block.type);
    expect(types).toContain('heading');
    expect(types).toContain('blockquote');
    expect(types).toContain('hr');
    expect(types.filter((type) => type === 'paragraph').length).toBeGreaterThan(0);
  });
});
