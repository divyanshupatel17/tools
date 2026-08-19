import { describe, expect, it } from 'vitest';
import { buildXlsx } from '@/lib/office/xlsx_writer';
import { readXlsxGrid } from '@/lib/office/xlsx_reader';
import { readOoxmlPackage } from '@/lib/office/ooxml';

describe('buildXlsx', () => {
  it('produces a package with the parts Excel requires to open without repair', async () => {
    const bytes = await buildXlsx([['a', 'b']]);
    const files = await readOoxmlPackage(bytes);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/workbook.xml',
        'xl/_rels/workbook.xml.rels',
        'xl/worksheets/sheet1.xml',
      ]),
    );
  });
});

describe('xlsx round-trip', () => {
  it('recovers a plain grid of strings', async () => {
    const rows = [
      ['Name', 'Amount'],
      ['Widget', '10'],
      ['Gadget & Co', '<5'],
    ];
    const bytes = await buildXlsx(rows, 'Data');
    const grid = await readXlsxGrid(bytes);
    expect(grid).toEqual(rows);
  });

  it('round-trips a number as a real number cell, not a string', async () => {
    const bytes = await buildXlsx([['42', 'not-a-number', '007']]);
    const grid = await readXlsxGrid(bytes);
    // 007 is not a plain-number round-trip (String(Number('007')) === '7' !== '007'), so it
    // must be preserved as a string rather than silently becoming 7.
    expect(grid).toEqual([['42', 'not-a-number', '007']]);
  });

  it('leaves gaps in a row where cells were skipped, keeping column alignment', async () => {
    const bytes = await buildXlsx([['A', '', 'C']]);
    const grid = await readXlsxGrid(bytes);
    expect(grid).toEqual([['A', '', 'C']]);
  });
});
