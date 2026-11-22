import type { TransactionRecord } from './types.ts';

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

/**
 * Escapes a single CSV field per RFC 4180 and neutralizes formula-injection
 * prefixes so exported spreadsheets cannot execute formulas in Excel/Sheets.
 */
export function escapeCsvCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw).replace(/\r?\n/g, ' ').trim();
  if (typeof raw === 'string' && FORMULA_PREFIX_RE.test(str)) {
    str = `'${str}`;
  }
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const TRANSACTION_CSV_HEADERS = [
  'Date',
  'Description',
  'Merchant',
  'Category',
  'Type',
  'Amount',
  'Source',
  'Confidence',
  'Method',
] as const;

export function exportTransactionsToCsv(records: TransactionRecord[]): string {
  const lines: string[] = [TRANSACTION_CSV_HEADERS.join(',')];

  for (const tx of records) {
    const confidencePct =
      tx.classificationConfidence !== null && Number.isFinite(tx.classificationConfidence)
        ? `${Math.round(tx.classificationConfidence * 100)}%`
        : '';

    const row = [
      escapeCsvCell(tx.transactionDate),
      escapeCsvCell(tx.description),
      escapeCsvCell(tx.merchant ?? ''),
      escapeCsvCell(tx.categoryName),
      escapeCsvCell(tx.transactionType),
      tx.amount.toFixed(2),
      escapeCsvCell(tx.source),
      escapeCsvCell(confidencePct),
      escapeCsvCell(tx.classificationMethod ?? ''),
    ];
    lines.push(row.join(','));
  }

  return `${lines.join('\r\n')}\r\n`;
}
