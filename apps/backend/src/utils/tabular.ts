import ExcelJS from 'exceljs';

/**
 * Turning query rows into a file an admin can open.
 *
 * Exports run over the whole filtered set, server side. Building them in the
 * browser would only ever see the twenty rows the table has loaded, which is
 * not what anyone means by "export bookings".
 */

export interface Column {
  /** Key on the row object. */
  key: string;
  header: string;
  /** Dates are written as dates, not as the ISO string Postgres hands back. */
  type?: 'text' | 'date' | 'datetime';
}

/**
 * Neutralises spreadsheet formula injection.
 *
 * Excel and Sheets execute a cell beginning with =, +, - or @. A visitor whose
 * name is `=HYPERLINK("http://evil","click")` would otherwise run that on the
 * machine of whoever opens the export. Prefixing with an apostrophe makes the
 * cell literal text; the apostrophe is not shown by the spreadsheet.
 */
function neutralise(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function format(value: unknown, type: Column['type']): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return type === 'date' ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  return String(value);
}

/** RFC 4180: quotes are doubled, and every field is quoted. */
function csvCell(value: string): string {
  return `"${neutralise(value).replace(/"/g, '""')}"`;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: Column[]): string {
  const header = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((row) =>
    columns.map((c) => csvCell(format(row[c.key], c.type))).join(',')
  );
  // The BOM is what makes Excel read the file as UTF-8. Without it, Arabic and
  // accented names arrive mangled.
  return `﻿${[header, ...body].join('\r\n')}\r\n`;
}

export async function toXlsx(
  rows: Array<Record<string, unknown>>,
  columns: Column[],
  sheetName: string
): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.created = new Date();
  // Excel rejects a sheet name over 31 characters or containing []:*?/\
  const sheet = book.addWorksheet(sheetName.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31));

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.min(40, Math.max(12, c.header.length + 4)),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) {
    sheet.addRow(
      Object.fromEntries(columns.map((c) => [c.key, neutralise(format(row[c.key], c.type))]))
    );
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  // ExcelJS types this as its own Buffer; Node's is what res.send wants.
  return Buffer.from(await book.xlsx.writeBuffer());
}

/** Safe for a Content-Disposition header and for a filesystem. */
export function exportFilename(base: string, extension: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base.replace(/[^a-z0-9-]/gi, '-')}-${stamp}.${extension}`;
}

/**
 * Writes rows out in whichever format `?format=` asked for.
 *
 * One helper for every export, so a new one cannot quietly ship without the
 * injection guard or the BOM. `json` exists so the browser can build a PDF from
 * the whole set rather than the page it happens to be showing.
 */
export async function sendTabular(
  res: {
    setHeader: (name: string, value: string) => void;
    send: (body: string | Buffer) => void;
    json: (body: unknown) => void;
    status: (code: number) => { json: (body: unknown) => void };
  },
  req: { query: Record<string, unknown> },
  rows: Array<Record<string, unknown>>,
  columns: Column[],
  base: string
): Promise<void> {
  const format = String(req.query.format ?? 'csv').toLowerCase();

  if (format === 'json') {
    res.json({ columns, rows, count: rows.length, generated_at: new Date().toISOString() });
    return;
  }

  if (format === 'xlsx') {
    const buffer = await toXlsx(rows, columns, base);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(base, 'xlsx')}"`);
    res.send(buffer);
    return;
  }

  if (format !== 'csv') {
    res.status(400).json({ error: `Unknown format "${format}". Use csv, xlsx or json.` });
    return;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(base, 'csv')}"`);
  res.send(toCsv(rows, columns));
}
