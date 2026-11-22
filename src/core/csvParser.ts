import crypto from 'node:crypto';
import { classifyTransaction } from './categorization.ts';
import type { CsvPreviewResult, InvalidCsvRow, ParsedCsvRow, TransactionType } from './types.ts';

const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB limit
const MAX_CSV_ROWS = 5000;

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

function sanitizeCell(value: string): string {
  // Neutralize CSV formula injection prefixes so descriptions remain untrusted plain data
  const trimmed = value.trim();
  if (/^[=+\-@]/.test(trimmed) && !/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed.replace(/^[=+\-@]+/, '').trim();
  }
  return trimmed;
}

function parseCsvLines(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentField);
        if (currentRow.some((cell) => cell.trim() !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentField);
        if (currentRow.some((cell) => cell.trim() !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((cell) => cell.trim() !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function normalizeDateString(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (isValidCalendarDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (isValidCalendarDate(year, month, day)) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }

  // DD-MMM-YYYY or DD MMM YYYY
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const monthStr = MONTH_MAP[m[2].toLowerCase()];
    const year = Number(m[3]);
    if (monthStr && isValidCalendarDate(year, Number(monthStr), day)) {
      return `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }

  return null;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function parseMoneyValue(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/₹|INR|Rs\.?|USD|\$/gi, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned || cleaned === '-' || cleaned === '--') return null;

  // Handle parentheses negative like (1200.50)
  const parenMatch = cleaned.match(/^\((\d+(?:\.\d+)?)\)$/);
  if (parenMatch) {
    return -Number(parenMatch[1]);
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
}

export function buildDedupeHash(
  date: string,
  amount: number,
  type: TransactionType,
  description: string
): string {
  const normalizedDesc = description.toLowerCase().replace(/\s+/g, ' ').trim();
  const payload = `${date}|${amount.toFixed(2)}|${type}|${normalizedDesc}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

function matchHeader(headers: string[], candidates: string[]): string | null {
  const lowerMap = new Map(headers.map((h) => [h.toLowerCase().trim(), h]));
  for (const cand of candidates) {
    if (lowerMap.has(cand)) return lowerMap.get(cand)!;
  }
  for (const h of headers) {
    const hl = h.toLowerCase().trim();
    if (candidates.some((c) => hl.includes(c))) {
      return h;
    }
  }
  return null;
}

export function parseAndPreviewCsv(
  csvText: string,
  filename: string,
  existingDedupeHashes: Set<string> = new Set()
): CsvPreviewResult {
  if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_BYTES) {
    throw new Error('CSV file exceeds the 2 MB maximum limit.');
  }

  const matrix = parseCsvLines(csvText);
  if (matrix.length < 2) {
    throw new Error('CSV must include a header row and at least one transaction row.');
  }

  if (matrix.length - 1 > MAX_CSV_ROWS) {
    throw new Error(`CSV exceeds maximum row limit of ${MAX_CSV_ROWS} rows.`);
  }

  const headers = matrix[0].map((h) => h.trim());
  const dateColumn = matchHeader(headers, ['transaction date', 'txn date', 'date', 'value date']);
  const descriptionColumn = matchHeader(headers, ['description', 'narration', 'particulars', 'remarks', 'details']);
  const amountColumn = matchHeader(headers, ['amount', 'txn amount', 'value']);
  const debitColumn = matchHeader(headers, ['debit', 'withdrawal', 'dr']);
  const creditColumn = matchHeader(headers, ['credit', 'deposit', 'cr']);
  const typeColumn = matchHeader(headers, ['type', 'transaction type', 'dr/cr', 'drcr']);
  const merchantColumn = matchHeader(headers, ['merchant', 'payee', 'vendor']);

  if (!dateColumn) {
    throw new Error('Could not detect a Date column (e.g. Date, Transaction Date).');
  }
  if (!descriptionColumn && !merchantColumn) {
    throw new Error('Could not detect a Description or Narration column.');
  }
  if (!amountColumn && !debitColumn && !creditColumn) {
    throw new Error('Could not detect Amount, Debit, or Credit columns.');
  }

  const seenInBatch = new Set<string>();
  const rows: ParsedCsvRow[] = [];
  const invalidRowDetails: InvalidCsvRow[] = [];
  let duplicateRows = 0;

  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i];
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = (line[idx] ?? '').trim();
    });

    const rawDate = rowObj[dateColumn] ?? '';
    const normalizedDate = normalizeDateString(rawDate);
    if (!normalizedDate) {
      invalidRowDetails.push({
        rowNumber: i + 1,
        raw: rowObj,
        reason: `Invalid or missing date "${rawDate}"`,
      });
      continue;
    }

    const rawDesc = sanitizeCell(
      (descriptionColumn ? rowObj[descriptionColumn] : '') ||
        (merchantColumn ? rowObj[merchantColumn] : '')
    );
    if (!rawDesc) {
      invalidRowDetails.push({
        rowNumber: i + 1,
        raw: rowObj,
        reason: 'Missing transaction description',
      });
      continue;
    }

    let amount: number | null = null;
    let txType: TransactionType | null = null;

    if (debitColumn || creditColumn) {
      const debitVal = debitColumn ? parseMoneyValue(rowObj[debitColumn]) : null;
      const creditVal = creditColumn ? parseMoneyValue(rowObj[creditColumn]) : null;
      if (debitVal !== null && debitVal > 0 && (creditVal === null || creditVal === 0)) {
        amount = debitVal;
        txType = 'DEBIT';
      } else if (creditVal !== null && creditVal > 0 && (debitVal === null || debitVal === 0)) {
        amount = creditVal;
        txType = 'CREDIT';
      } else if (debitVal !== null && debitVal > 0 && creditVal !== null && creditVal > 0) {
        invalidRowDetails.push({
          rowNumber: i + 1,
          raw: rowObj,
          reason: 'Row has both positive Debit and Credit amounts',
        });
        continue;
      }
    }

    if (amount === null && amountColumn) {
      const parsedAmount = parseMoneyValue(rowObj[amountColumn]);
      if (parsedAmount !== null && parsedAmount !== 0) {
        const rawType = typeColumn ? rowObj[typeColumn].toUpperCase() : '';
        if (rawType.includes('CR') || rawType === 'CREDIT' || rawType === 'INCOME') {
          txType = 'CREDIT';
          amount = Math.abs(parsedAmount);
        } else if (rawType.includes('DR') || rawType === 'DEBIT' || rawType === 'EXPENSE') {
          txType = 'DEBIT';
          amount = Math.abs(parsedAmount);
        } else if (parsedAmount < 0) {
          txType = 'DEBIT';
          amount = Math.abs(parsedAmount);
        } else {
          // If positive without explicit type, check description keywords or default DEBIT
          const looksLikeCredit = /\b(salary|credit|refund|freelance|stipend|dividend|interest)\b/i.test(rawDesc);
          txType = looksLikeCredit ? 'CREDIT' : 'DEBIT';
          amount = parsedAmount;
        }
      }
    }

    if (amount === null || amount <= 0 || !txType) {
      invalidRowDetails.push({
        rowNumber: i + 1,
        raw: rowObj,
        reason: 'Missing or non-positive transaction amount',
      });
      continue;
    }

    const rawMerchant = merchantColumn ? sanitizeCell(rowObj[merchantColumn]) : undefined;
    const classification = classifyTransaction(rawDesc, txType, rawMerchant);
    const dedupeHash = buildDedupeHash(normalizedDate, amount, txType, rawDesc);

    const isDuplicate = existingDedupeHashes.has(dedupeHash) || seenInBatch.has(dedupeHash);
    if (isDuplicate) {
      duplicateRows++;
    } else {
      seenInBatch.add(dedupeHash);
    }

    rows.push({
      rowNumber: i + 1,
      transactionDate: normalizedDate,
      description: rawDesc,
      merchant: classification.normalizedMerchant,
      amount: Number(amount.toFixed(2)),
      transactionType: txType,
      category: classification.category,
      subcategory: classification.subcategory,
      confidence: classification.confidence,
      method: classification.method,
      dedupeHash,
      isDuplicate,
    });
  }

  return {
    filename: sanitizeCell(filename) || 'statement.csv',
    detectedColumns: {
      dateColumn,
      descriptionColumn,
      amountColumn,
      debitColumn,
      creditColumn,
      typeColumn,
      merchantColumn,
    },
    totalRows: matrix.length - 1,
    validRows: rows.length,
    invalidRows: invalidRowDetails.length,
    duplicateRows,
    rows,
    invalidRowDetails,
  };
}
