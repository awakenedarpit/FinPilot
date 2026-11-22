import type {
  CategorySpendSummary,
  MerchantSummary,
  MonthlyTrendPoint,
  RecurringCandidate,
} from './types.ts';

export interface MonthlySpendingPdfInput {
  currency: string;
  accountLabel: string;
  generatedAtIso: string;
  trends: MonthlyTrendPoint[];
  categories: CategorySpendSummary[];
  merchants: MerchantSummary[];
  recurring: RecurringCandidate[];
}

function toAsciiPdfSafe(text: string): string {
  return text
    .replace(/₹/g, 'INR ')
    .replace(/[–—]/g, '-')
    .replace(/[•·]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function escapePdfString(text: string): string {
  return toAsciiPdfSafe(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function formatPdfMoney(amount: number, currency: string): string {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  const prefix = amount < 0 ? '-' : '';
  return `${prefix}${currency} ${formatted}`;
}

function formatPdfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!y || !m || m < 1 || m > 12) return ym;
  return `${months[m - 1]} ${y}`;
}

class PdfPageBuilder {
  private pages: string[][] = [[]];
  private y = 760;
  private readonly pageBottom = 56;

  currentStream(): string[] {
    return this.pages[this.pages.length - 1];
  }

  newPage(titleNote: string) {
    this.pages.push([]);
    this.y = 760;
    this.drawText(titleNote, 48, 795, { size: 8, color: '0.45 0.50 0.58' });
    this.drawLine(48, 786, 547, 786, '0.88 0.90 0.94');
    this.y = 764;
  }

  ensureSpace(heightNeeded: number, continuationTitle: string) {
    if (this.y - heightNeeded < this.pageBottom) {
      this.newPage(continuationTitle);
    }
  }

  getY(): number {
    return this.y;
  }

  advance(delta: number) {
    this.y -= delta;
  }

  drawRect(x: number, y: number, w: number, h: number, fillRgb: string) {
    this.currentStream().push(`q ${fillRgb} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f Q`);
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, strokeRgb = '0.85 0.88 0.92', width = 0.6) {
    this.currentStream().push(
      `q ${strokeRgb} RG ${width.toFixed(2)} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S Q`
    );
  }

  drawText(
    text: string,
    x: number,
    y: number,
    opts: { bold?: boolean; size?: number; color?: string } = {}
  ) {
    const font = opts.bold ? '/F2' : '/F1';
    const size = opts.size ?? 10;
    const color = opts.color ?? '0.08 0.12 0.22';
    this.currentStream().push(
      `BT ${font} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${escapePdfString(text)}) Tj ET`
    );
  }

  getPagesContent(): string[] {
    return this.pages.map((cmds) => cmds.join('\n'));
  }
}

/**
 * Generates a spec-compliant PDF 1.4 summary report of monthly spending trends,
 * category breakdown, top merchants, and recurring commitments.
 */
export function generateMonthlySpendingPdf(input: MonthlySpendingPdfInput): Uint8Array {
  const builder = new PdfPageBuilder();
  const { currency, accountLabel, generatedAtIso, trends, categories, merchants, recurring } = input;
  const continuationTitle = `FinPilot AI - Monthly Spending Trends Summary (${currency}) - Continued`;

  // Top Navy Header Banner
  builder.drawRect(0, 738, 595, 104, '0.063 0.106 0.196');
  builder.drawText('FinPilot AI', 48, 804, { bold: true, size: 18, color: '1 1 1' });
  builder.drawText('Monthly Spending Trends Summary Report', 48, 783, {
    bold: true,
    size: 12,
    color: '0.82 0.88 0.98',
  });
  builder.drawText(
    `Account: ${accountLabel}  |  Currency: ${currency}  |  Generated: ${generatedAtIso.slice(0, 10)}`,
    48,
    760,
    { size: 8.5, color: '0.70 0.77 0.89' }
  );

  // Move cursor below banner
  while (builder.getY() > 714) builder.advance(10);

  // Compute aggregate stats across observed months
  const totalIncome = trends.reduce((s, t) => s + t.income, 0);
  const totalExpenses = trends.reduce((s, t) => s + t.expenses, 0);
  const netCashFlow = totalIncome - totalExpenses;
  const latestTrend = trends[trends.length - 1] ?? null;
  const prevTrend = trends.length >= 2 ? trends[trends.length - 2] : null;
  const momExpenseDelta =
    latestTrend && prevTrend && prevTrend.expenses > 0
      ? ((latestTrend.expenses - prevTrend.expenses) / prevTrend.expenses) * 100
      : null;

  // Summary KPI Strip (3 cards)
  const kpiY = builder.getY() - 50;
  builder.drawRect(48, kpiY, 158, 54, '0.965 0.973 0.988');
  builder.drawRect(218, kpiY, 158, 54, '0.965 0.973 0.988');
  builder.drawRect(388, kpiY, 159, 54, '0.965 0.973 0.988');

  builder.drawText('TOTAL INCOME', 58, kpiY + 38, { bold: true, size: 7.5, color: '0.39 0.45 0.55' });
  builder.drawText(formatPdfMoney(totalIncome, currency), 58, kpiY + 20, { bold: true, size: 11 });
  builder.drawText(`${trends.length} observed month(s)`, 58, kpiY + 8, { size: 7.5, color: '0.45 0.50 0.58' });

  builder.drawText('TOTAL EXPENSES', 228, kpiY + 38, { bold: true, size: 7.5, color: '0.39 0.45 0.55' });
  builder.drawText(formatPdfMoney(totalExpenses, currency), 228, kpiY + 20, { bold: true, size: 11 });
  builder.drawText(
    momExpenseDelta !== null
      ? `Latest MoM: ${momExpenseDelta >= 0 ? '+' : ''}${momExpenseDelta.toFixed(1)}%`
      : 'Cumulative debits',
    228,
    kpiY + 8,
    { size: 7.5, color: '0.45 0.50 0.58' }
  );

  builder.drawText('NET CASH FLOW', 398, kpiY + 38, { bold: true, size: 7.5, color: '0.39 0.45 0.55' });
  builder.drawText(formatPdfMoney(netCashFlow, currency), 398, kpiY + 20, { bold: true, size: 11 });
  builder.drawText(
    latestTrend ? `Latest (${formatPdfMonth(latestTrend.month)}): ${formatPdfMoney(latestTrend.netCashFlow, currency)}` : 'Period net',
    398,
    kpiY + 8,
    { size: 7.5, color: '0.45 0.50 0.58' }
  );

  builder.advance(76);

  // Section 1: Monthly Income vs. Expenses Trends
  builder.ensureSpace(70, continuationTitle);
  builder.drawText('1. Monthly Income vs. Expenses Trends', 48, builder.getY(), {
    bold: true,
    size: 11.5,
  });
  builder.advance(16);
  builder.drawRect(48, builder.getY() - 4, 499, 18, '0.94 0.96 0.99');
  builder.drawText('Month', 54, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
  builder.drawText('Income', 148, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
  builder.drawText('Expenses', 250, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
  builder.drawText('Net Cash Flow', 352, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
  builder.drawText('Savings Rate', 456, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
  builder.drawText('Txns', 522, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
  builder.advance(20);

  for (const t of trends) {
    builder.ensureSpace(22, continuationTitle);
    const y = builder.getY();
    builder.drawText(formatPdfMonth(t.month), 54, y, { bold: true, size: 9 });
    builder.drawText(formatPdfMoney(t.income, currency), 148, y, { size: 8.5 });
    builder.drawText(formatPdfMoney(t.expenses, currency), 250, y, { size: 8.5 });
    builder.drawText(formatPdfMoney(t.netCashFlow, currency), 352, y, { size: 8.5 });
    builder.drawText(
      t.savingsRatePercent !== null ? `${t.savingsRatePercent.toFixed(1)}%` : 'N/A',
      456,
      y,
      { size: 8.5 }
    );
    builder.drawText(String(t.transactionCount), 524, y, { size: 8.5 });
    builder.drawLine(48, y - 5, 547, y - 5, '0.92 0.94 0.96', 0.4);
    builder.advance(18);
  }

  builder.advance(16);

  // Section 2: Category Spending Breakdown
  builder.ensureSpace(70, continuationTitle);
  builder.drawText('2. Category Spending Breakdown', 48, builder.getY(), {
    bold: true,
    size: 11.5,
  });
  builder.advance(16);
  builder.drawRect(48, builder.getY() - 4, 499, 18, '0.94 0.96 0.99');
  builder.drawText('Category', 54, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
  builder.drawText('Share', 240, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
  builder.drawText('Distribution', 300, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
  builder.drawText('Txns', 415, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
  builder.drawText('Total Spend', 462, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
  builder.advance(20);

  for (const cat of categories.slice(0, 12)) {
    builder.ensureSpace(22, continuationTitle);
    const y = builder.getY();
    builder.drawText(cat.category.slice(0, 26), 54, y, { bold: true, size: 9 });
    builder.drawText(`${cat.sharePercent.toFixed(1)}%`, 240, y, { size: 8.5 });
    // Mini visual bar
    builder.drawRect(300, y + 1, 95, 6, '0.92 0.94 0.97');
    const barW = Math.max(2, Math.min(95, (cat.sharePercent / 100) * 95));
    builder.drawRect(300, y + 1, barW, 6, '0.255 0.412 0.882');
    builder.drawText(String(cat.count), 418, y, { size: 8.5 });
    builder.drawText(formatPdfMoney(cat.total, currency), 462, y, { size: 8.5 });
    builder.drawLine(48, y - 5, 547, y - 5, '0.92 0.94 0.96', 0.4);
    builder.advance(18);
  }

  builder.advance(16);

  // Section 3: Top Merchants & Recurring Commitments
  if (merchants.length > 0) {
    builder.ensureSpace(70, continuationTitle);
    builder.drawText('3. Top Merchants by Spend', 48, builder.getY(), { bold: true, size: 11.5 });
    builder.advance(16);
    builder.drawRect(48, builder.getY() - 4, 499, 18, '0.94 0.96 0.99');
    builder.drawText('Merchant', 54, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
    builder.drawText('Primary Category', 240, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
    builder.drawText('Count', 380, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
    builder.drawText('Total Spend', 450, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
    builder.advance(20);

    for (const m of merchants.slice(0, 8)) {
      builder.ensureSpace(22, continuationTitle);
      const y = builder.getY();
      builder.drawText(m.merchant.slice(0, 28), 54, y, { bold: true, size: 9 });
      builder.drawText(m.primaryCategory.slice(0, 20), 240, y, { size: 8.5 });
      builder.drawText(String(m.count), 385, y, { size: 8.5 });
      builder.drawText(formatPdfMoney(m.total, currency), 450, y, { size: 8.5 });
      builder.drawLine(48, y - 5, 547, y - 5, '0.92 0.94 0.96', 0.4);
      builder.advance(18);
    }
    builder.advance(16);
  }

  if (recurring.length > 0) {
    builder.ensureSpace(70, continuationTitle);
    builder.drawText('4. Detected Recurring Commitments', 48, builder.getY(), {
      bold: true,
      size: 11.5,
    });
    builder.advance(16);
    builder.drawRect(48, builder.getY() - 4, 499, 18, '0.94 0.96 0.99');
    builder.drawText('Merchant', 54, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
    builder.drawText('Category', 225, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
    builder.drawText('Next Est. Date', 350, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
    builder.drawText('Avg Monthly', 456, builder.getY() + 1, { bold: true, size: 8.5, color: '0.28 0.34 0.44' });
    builder.advance(20);

    for (const r of recurring.slice(0, 8)) {
      builder.ensureSpace(22, continuationTitle);
      const y = builder.getY();
      builder.drawText(r.merchant.slice(0, 25), 54, y, { bold: true, size: 9 });
      builder.drawText(r.category.slice(0, 18), 225, y, { size: 8.5 });
      builder.drawText(r.nextEstimatedDate, 350, y, { size: 8.5 });
      builder.drawText(formatPdfMoney(r.averageAmount, currency), 456, y, { size: 8.5 });
      builder.drawLine(48, y - 5, 547, y - 5, '0.92 0.94 0.96', 0.4);
      builder.advance(18);
    }
  }

  // Assemble PDF 1.4 objects with exact UTF-8 byte offsets for xref
  const pageStreams = builder.getPagesContent();
  const encoder = new TextEncoder();
  const objects: string[] = [];

  // Obj 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Obj 2: Pages (kids are 5, 7, 9, ...)
  const pageObjectIds = pageStreams.map((_, idx) => 5 + idx * 2);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageStreams.length} >>\nendobj\n`
  );

  // Obj 3 & 4: Fonts (Helvetica & Helvetica-Bold)
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');

  // Page + Content Stream objects
  pageStreams.forEach((streamStr, idx) => {
    const pageId = 5 + idx * 2;
    const contentId = pageId + 1;
    const streamBytesLen = encoder.encode(streamStr).byteLength;
    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentId} 0 obj\n<< /Length ${streamBytesLen} >>\nstream\n${streamStr}\nendstream\nendobj\n`
    );
  });

  const chunks: string[] = ['%PDF-1.4\n'];
  let offset = encoder.encode(chunks[0]).byteLength;
  const xrefOffsets: number[] = [0];

  for (const objStr of objects) {
    xrefOffsets.push(offset);
    chunks.push(objStr);
    offset += encoder.encode(objStr).byteLength;
  }

  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < xrefOffsets.length; i++) {
    xref += `${String(xrefOffsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  chunks.push(xref, trailer);
  return encoder.encode(chunks.join(''));
}
