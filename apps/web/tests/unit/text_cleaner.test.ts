import { describe, expect, it } from 'vitest';
import { cleanText, DEFAULT_CLEAN_OPTIONS } from '@/lib/text/text_cleaner';

const ALL_OFF = {
  extra_spaces: false,
  blank_lines: false,
  invisible_characters: false,
  emojis: false,
  accents: false,
  smart_quotes: false,
  html_tags: false,
};

describe('cleanText', () => {
  it('collapses multiple spaces and tabs when Extra Spaces is on', () => {
    expect(cleanText('a   b\t\tc', { ...ALL_OFF, extra_spaces: true })).toBe('a b c');
  });

  it('removes empty lines when Blank Lines is on', () => {
    expect(cleanText('a\n\nb\n\n\nc', { ...ALL_OFF, blank_lines: true })).toBe('a\nb\nc');
  });

  it('removes zero width characters when Invisible Characters is on', () => {
    const withZeroWidth = `a${String.fromCharCode(0x200b)}b${String.fromCharCode(0xfeff)}c`;
    expect(cleanText(withZeroWidth, { ...ALL_OFF, invisible_characters: true })).toBe('abc');
  });

  it('removes emoji when Emojis is on', () => {
    expect(cleanText('Hello 👋 World 😊', { ...ALL_OFF, emojis: true })).toBe('Hello  World ');
  });

  it('strips accents when Accents is on', () => {
    expect(cleanText('café naïve', { ...ALL_OFF, accents: true })).toBe('cafe naive');
  });

  it('replaces smart quotes with straight quotes when Smart Quotes is on', () => {
    expect(cleanText('“hello” and ‘hi’', { ...ALL_OFF, smart_quotes: true })).toBe(
      '"hello" and \'hi\'',
    );
  });

  it('strips HTML tags when HTML Tags is on', () => {
    expect(cleanText('<b>bold</b> and <i>italic</i>', { ...ALL_OFF, html_tags: true })).toBe(
      'bold and italic',
    );
  });

  it('leaves text untouched when every option is off', () => {
    const text = '  messy   text  \n\n<b>tag</b> café “quote”';
    expect(cleanText(text, ALL_OFF)).toBe(text);
  });

  it('applies every default option together', () => {
    const input = 'Café  “naïve”  <b>test</b>\n\n\nline two';
    const result = cleanText(input, DEFAULT_CLEAN_OPTIONS);
    expect(result).not.toContain('<b>');
    expect(result).not.toContain('é');
    expect(result).not.toContain('“');
    expect(result).toBe('Cafe "naive" test\nline two');
  });
});
