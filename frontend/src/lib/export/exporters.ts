import type { QueryResults } from '@/types/queries';

/**
 * Generate a timestamped filename for exports.
 */
function makeFilename(prefix: string, ext: string): string {
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `${prefix}_${ts}.${ext}`;
}

/**
 * Trigger a browser download from a Blob.
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export query results to CSV with BOM for Arabic text support in Excel.
 */
export function exportToCsv(
  data: QueryResults,
  filename?: string
): void {
  const escape = (val: string | number | null): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = data.columns.map(escape).join(',');
  const body = data.rows.map((row) => row.map(escape).join(',')).join('\n');
  // BOM for Arabic text support
  const bom = '\uFEFF';
  const csv = bom + header + '\n' + body;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename || makeFilename('raid_ai_results', 'csv'));
}

/**
 * Export query results to Excel using SheetJS.
 */
export async function exportToExcel(
  data: QueryResults,
  filename?: string
): Promise<void> {
  const XLSX = await import('xlsx');

  // Build worksheet data: header row + data rows
  const wsData = [data.columns, ...data.rows.map((row) =>
    row.map((cell) => (cell === null ? '' : cell))
  )];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-width columns
  const colWidths = data.columns.map((col, i) => {
    let maxLen = col.length;
    for (const row of data.rows) {
      const cell = row[i];
      if (cell !== null && cell !== undefined) {
        maxLen = Math.max(maxLen, String(cell).length);
      }
    }
    return { wch: Math.min(maxLen + 2, 50) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, filename || makeFilename('raid_ai_results', 'xlsx'));
}

/**
 * Export query results to PDF using jsPDF + jspdf-autotable.
 */
export async function exportToPdf(
  data: QueryResults,
  title?: string,
  filename?: string
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: data.columns.length > 5 ? 'landscape' : 'portrait' });

  // Title
  doc.setFontSize(14);
  doc.setTextColor(212, 168, 75); // Gold color
  doc.text(title || "Ra'd AI - Query Results", 14, 18);

  // Timestamp
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 25);

  // Table
  const bodyRows = data.rows.map((row) =>
    row.map((cell) => (cell !== null && cell !== undefined ? String(cell) : '-'))
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    head: [data.columns],
    body: bodyRows,
    startY: 30,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: [212, 168, 75],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    didDrawPage: (hookData: { pageNumber: number }) => {
      // Page number footer
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(
        `Page ${hookData.pageNumber} of ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      );
    },
  });

  doc.save(filename || makeFilename('raid_ai_results', 'pdf'));
}
