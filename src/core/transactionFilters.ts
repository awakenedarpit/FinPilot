import type { TransactionRecord } from './types.ts';

export type DateRangePresetId = 'all' | 'last_30' | 'last_90' | 'this_month' | 'last_month';

export interface DateRangeValue {
  startDate: string;
  endDate: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pure real-time client filter matching merchant name, transaction description/note,
 * or category name case-insensitively.
 */
export function filterTransactionsByQuery(
  transactions: TransactionRecord[],
  query: string
): TransactionRecord[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return transactions;

  return transactions.filter((tx) => {
    const merchant = (tx.merchant ?? '').toLowerCase();
    const description = tx.description.toLowerCase();
    const category = tx.categoryName.toLowerCase();
    return (
      merchant.includes(needle) || description.includes(needle) || category.includes(needle)
    );
  });
}

/**
 * Validates a custom start/end date pair (YYYY-MM-DD).
 * Returns null if valid, or a user-facing error message if inverted/malformed.
 */
export function validateDateRange(startDate: string, endDate: string): string | null {
  if (startDate && !ISO_DATE_RE.test(startDate)) {
    return 'Start date must use YYYY-MM-DD format.';
  }
  if (endDate && !ISO_DATE_RE.test(endDate)) {
    return 'End date must use YYYY-MM-DD format.';
  }
  if (startDate && endDate && startDate > endDate) {
    return 'Start date cannot be after end date.';
  }
  return null;
}

function formatUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeDateRangePreset(
  preset: DateRangePresetId,
  referenceDate: Date = new Date()
): DateRangeValue {
  if (preset === 'all') {
    return { startDate: '', endDate: '' };
  }

  const refUtc = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  );

  if (preset === 'last_30') {
    const start = new Date(refUtc);
    start.setUTCDate(start.getUTCDate() - 29);
    return { startDate: formatUtcDate(start), endDate: formatUtcDate(refUtc) };
  }

  if (preset === 'last_90') {
    const start = new Date(refUtc);
    start.setUTCDate(start.getUTCDate() - 89);
    return { startDate: formatUtcDate(start), endDate: formatUtcDate(refUtc) };
  }

  if (preset === 'this_month') {
    const start = new Date(Date.UTC(refUtc.getUTCFullYear(), refUtc.getUTCMonth(), 1));
    return { startDate: formatUtcDate(start), endDate: formatUtcDate(refUtc) };
  }

  // last_month
  const start = new Date(Date.UTC(refUtc.getUTCFullYear(), refUtc.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(refUtc.getUTCFullYear(), refUtc.getUTCMonth(), 0));
  return { startDate: formatUtcDate(start), endDate: formatUtcDate(end) };
}
