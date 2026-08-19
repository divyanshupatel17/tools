import { describe, expect, it } from 'vitest';
import { toggleTaskLine } from '@/lib/text/markdown/tasks';

describe('toggleTaskLine', () => {
  it('checks an unchecked task', () => {
    expect(toggleTaskLine('- [ ] Buy milk', 0)).toBe('- [x] Buy milk');
  });

  it('unchecks a checked task', () => {
    expect(toggleTaskLine('- [x] Buy milk', 0)).toBe('- [ ] Buy milk');
  });

  it('is case insensitive for an uppercase X', () => {
    expect(toggleTaskLine('- [X] Buy milk', 0)).toBe('- [ ] Buy milk');
  });

  it('only touches the requested line', () => {
    const source = '- [ ] one\n- [ ] two';
    expect(toggleTaskLine(source, 1)).toBe('- [ ] one\n- [x] two');
  });

  it('leaves a line with no checkbox unchanged', () => {
    expect(toggleTaskLine('Just text', 0)).toBe('Just text');
  });

  it('returns the source unchanged for an out of range line number', () => {
    const source = '- [ ] one';
    expect(toggleTaskLine(source, 5)).toBe(source);
  });
});
