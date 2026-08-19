import { readOoxmlPackage, readOoxmlText, stripXmlTags } from './ooxml';

function columnIndex(cellRef: string): number {
  const letters = /^[A-Z]+/.exec(cellRef)?.[0] ?? 'A';
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  const siPattern = /<si>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siPattern.exec(xml))) {
    const textPattern = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let textMatch: RegExpExecArray | null;
    let text = '';
    while ((textMatch = textPattern.exec(match[1]!))) text += stripXmlTags(textMatch[1]!);
    strings.push(text);
  }
  return strings;
}

function firstSheetPath(workbookXml: string, relsXml: string | undefined): string {
  const firstSheetId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbookXml)?.[1];
  const target =
    firstSheetId && relsXml
      ? new RegExp(`<Relationship\\b[^>]*\\bId="${firstSheetId}"[^>]*\\bTarget="([^"]+)"`).exec(
          relsXml,
        )?.[1]
      : undefined;
  return `xl/${target ?? 'worksheets/sheet1.xml'}`;
}

/** Reads the first sheet of a .xlsx back into a plain grid of cell text — numbers, inline
 * strings and shared strings all resolve to their display text; formulas resolve to their last
 * cached value (the `<v>` a spreadsheet app already wrote), not re-evaluated. Only the first
 * sheet is read; a workbook with more is treated the same as one with a single sheet named
 * something else, since a PDF page has no natural "which sheet" equivalent. */
export async function readXlsxGrid(bytes: Uint8Array): Promise<string[][]> {
  const files = await readOoxmlPackage(bytes);
  const workbookXml = await readOoxmlText(files, 'xl/workbook.xml');
  if (!workbookXml) throw new Error('This file has no xl/workbook.xml — it may not be a .xlsx.');

  const relsXml = await readOoxmlText(files, 'xl/_rels/workbook.xml.rels');
  const sheetPath = firstSheetPath(workbookXml, relsXml);
  const sheetXml = await readOoxmlText(files, sheetPath);
  if (!sheetXml) throw new Error('The first worksheet could not be found in this file.');

  const sharedStrings = parseSharedStrings(await readOoxmlText(files, 'xl/sharedStrings.xml'));

  const grid: string[][] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(sheetXml))) {
    const row: string[] = [];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellPattern.exec(rowMatch[1]!))) {
      const attrs = cellMatch[1] ?? cellMatch[3] ?? '';
      const inner = cellMatch[2] ?? '';
      const ref = /\br="([^"]+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const index = ref ? columnIndex(ref) : row.length;

      let value = '';
      if (type === 'inlineStr') {
        value = stripXmlTags(/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? '');
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
        value = type === 's' ? (sharedStrings[Number(raw)] ?? '') : raw;
      }

      while (row.length < index) row.push('');
      row[index] = value;
    }

    grid.push(row);
  }

  return grid;
}
