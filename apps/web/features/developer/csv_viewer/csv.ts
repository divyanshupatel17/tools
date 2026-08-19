export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export interface ParseFailure {
  ok: false;
  message: string;
}

export interface ParseSuccess {
  ok: true;
  table: CsvTable;
}

export type ParseResult = ParseSuccess | ParseFailure;

/** RFC 4180 parse: handles quoted fields, embedded commas/newlines, and doubled "" escapes. */
export function parseCsv(source: string): ParseResult {
  const text = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (text.trim() === '') {
    return { ok: false, message: 'There is nothing to view yet.' };
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (inQuotes) {
    return { ok: false, message: 'A quoted field is never closed. Check for a missing closing quote.' };
  }
  row.push(field);
  rows.push(row);

  // A trailing newline produces one bogus final row of a single empty field; drop it.
  const last = rows[rows.length - 1];
  if (last && last.length === 1 && last[0] === '' && rows.length > 1) rows.pop();

  if (rows.length === 0) {
    return { ok: false, message: 'There is nothing to view yet.' };
  }

  const headers = rows[0] ?? [];
  const body = rows.slice(1);
  const width = headers.length;
  const normalized = body.map((line) => {
    if (line.length === width) return line;
    const padded = line.slice(0, width);
    while (padded.length < width) padded.push('');
    return padded;
  });

  return { ok: true, table: { headers, rows: normalized } };
}

function needsQuoting(value: string): boolean {
  return value.includes(',') || value.includes('"') || value.includes('\n');
}

function quoteField(value: string): string {
  return needsQuoting(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function stringifyCsv(table: CsvTable): string {
  const lines = [table.headers, ...table.rows].map((line) => line.map(quoteField).join(','));
  return lines.join('\n');
}

export function csvToJson(table: CsvTable): string {
  const objects = table.rows.map((row) =>
    Object.fromEntries(table.headers.map((header, index) => [header, row[index] ?? ''])),
  );
  return JSON.stringify(objects, null, 2);
}

function sanitizeTagName(name: string, fallback: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/^[^a-zA-Z_]+/, '');
  return cleaned === '' ? fallback : cleaned;
}

export async function csvToXml(table: CsvTable): Promise<string> {
  const { XMLBuilder } = await import('fast-xml-parser');
  const builder = new XMLBuilder({ format: true, indentBy: '  ', textNodeName: '#text' });
  const columns = table.headers.map((header, index) => sanitizeTagName(header, `column${index + 1}`));
  const rows = table.rows.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ''])),
  );
  const body = builder.build({ rows: { row: rows } });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

export type SortDirection = 'asc' | 'desc';

/** Numeric aware compare so a column of numbers sorts by value, not lexically. */
export function sortRows(rows: string[][], columnIndex: number, direction: SortDirection): string[][] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[columnIndex] ?? '';
    const right = b[columnIndex] ?? '';
    const leftNum = Number(left);
    const rightNum = Number(right);
    if (left !== '' && right !== '' && !Number.isNaN(leftNum) && !Number.isNaN(rightNum)) {
      return (leftNum - rightNum) * factor;
    }
    return left.localeCompare(right) * factor;
  });
}
