'use client';

/**
 * Report exports.
 *
 * CSV and Excel are produced by the server and simply downloaded here. Two
 * reasons: the admin tables are paginated at twenty rows, so anything built in
 * the browser would export the page rather than the data; and the escaping that
 * keeps a spreadsheet from executing a cell as a formula then lives in one
 * place instead of two.
 *
 * PDF is built here, from the full set fetched as JSON, because it is a
 * presentation concern and the layout belongs next to the screen it mirrors.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface ExportColumn { key: string; header: string; type?: string }

interface Dataset {
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  count: number;
  generated_at: string;
}

function authHeaders(): HeadersInit {
  const token = typeof window === 'undefined' ? null : localStorage.getItem('lsn_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function filenameFrom(response: Response, fallback: string): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  return /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallback;
}

/**
 * Downloads CSV or XLSX from an export endpoint.
 *
 * Fetched rather than linked because the endpoint needs an Authorization
 * header — a plain anchor cannot send one, and putting the token in the query
 * string would leak it into logs.
 */
export async function downloadExport(
  path: string,
  params: Record<string, string | undefined>,
  format: 'csv' | 'xlsx'
): Promise<void> {
  const query = new URLSearchParams({ format });
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }

  const response = await fetch(`${API}${path}?${query}`, { headers: authHeaders() });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Export failed (${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFrom(response, `export.${format}`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Released on the next tick; revoking immediately can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Fetches every row, not the page the table happens to be showing. */
export async function fetchDataset(
  path: string,
  params: Record<string, string | undefined>
): Promise<Dataset> {
  const query = new URLSearchParams({ format: 'json' });
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const response = await fetch(`${API}${path}?${query}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  return (await response.json()) as Dataset;
}

/**
 * Builds a PDF of a dataset.
 *
 * jsPDF's table plugin rather than html2canvas: rasterising the DOM gives a
 * picture of a table — no selectable text, no search, blurry when printed, and
 * a file several times the size. autoTable emits real text, repeats the header
 * across pages and handles column widths itself.
 *
 * Imported dynamically so roughly 400 kB of PDF machinery is fetched when
 * somebody exports, not when the page loads.
 */
export async function exportToPDF(
  data: Dataset,
  title: string,
  subtitle?: string
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  // Landscape: these tables are wider than they are tall.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const generated = new Date(data.generated_at).toLocaleString();

  doc.setFontSize(16);
  doc.text(title, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(
    [subtitle, `${data.count} record${data.count === 1 ? '' : 's'}`, `Generated ${generated}`]
      .filter(Boolean).join('   ·   '),
    40, 58
  );

  autoTable(doc, {
    startY: 74,
    head: [data.columns.map((c) => c.header)],
    body: data.rows.map((row) =>
      data.columns.map((c) => {
        const value = row[c.key];
        if (value === null || value === undefined) return '';
        if (c.type === 'date') return String(value).slice(0, 10);
        if (c.type === 'datetime') return new Date(String(value)).toLocaleString();
        return String(value);
      })
    ),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [39, 39, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 244, 245] },
    margin: { left: 40, right: 40 },
  });

  if (data.count === 0) {
    doc.setFontSize(10);
    doc.setTextColor(140);
    doc.text('No records for this selection.', 40, 100);
  }

  doc.save(`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
