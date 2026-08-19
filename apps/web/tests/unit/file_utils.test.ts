import { describe, expect, it } from 'vitest';
import { fileExtension, formatBytes, replaceExtension, safeFileName } from '@tools/file_utils';

describe('file_utils', () => {
  it('formats byte counts', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('strips directories and path metacharacters from untrusted names', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Users\\me\\report.pdf')).toBe('report.pdf');
    expect(safeFileName('..')).toBe('file');
    expect(safeFileName('a<b>c.txt')).toBe('abc.txt');
  });

  it('reads and replaces extensions', () => {
    expect(fileExtension('photo.JPG')).toBe('jpg');
    expect(fileExtension('noextension')).toBe('');
    expect(replaceExtension('photo.jpg', 'png')).toBe('photo.png');
  });
});
