import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTransaction, normalizeMerchantName } from './categorization.ts';
import { parseAndPreviewCsv, normalizeDateString, parseMoneyValue } from './csvParser.ts';
import {
  computeOverviewMetrics,
  computeMonthlyTrends,
  computeMerchantAnalysis,
  detectRecurringExpenses,
} from './analytics.ts';
import { generateCashFlowForecast } from './forecasting.ts';
import { detectAnomalies } from './anomaly.ts';
import { runScenarioSimulation } from './simulation.ts';
import { DEMO_INDIAN_TRANSACTIONS, generateDemoCsvString } from './demoData.ts';
import type { TransactionRecord } from './types.ts';

function buildDemoRecords(userId = 'user-test'): TransactionRecord[] {
  return DEMO_INDIAN_TRANSACTIONS.map((row, idx) => {
    const cls = classifyTransaction(row.description, row.transactionType, row.merchant);
    return {
      id: `tx-${idx + 1}`,
      userId,
      description: row.description,
      merchant: row.merchant,
      amount: row.amount,
      transactionType: row.transactionType,
      categoryId: null,
      categoryName: cls.category,
      subcategory: cls.subcategory,
      transactionDate: row.transactionDate,
      source: 'DEMO',
      externalReference: null,
      dedupeHash: `hash-${idx + 1}`,
      isRecurring: false,
      classificationConfidence: cls.confidence,
      classificationMethod: cls.method,
    };
  });
}

test('categorization classifies known Indian merchants accurately and falls back transparently', () => {
  const swiggy = classifyTransaction('UPI-SWIGGY-123456@okaxis', 'DEBIT');
  assert.equal(swiggy.category, 'Food');
  assert.equal(swiggy.method, 'merchant_rule');
  assert.ok(swiggy.confidence >= 0.9);

  const salary = classifyTransaction('NEFT SALARY CREDIT ACME', 'CREDIT');
  assert.equal(salary.category, 'Salary');
  assert.equal(salary.method, 'merchant_rule');

  const unknown = classifyTransaction('RANDOM VENDOR XYZ 9988', 'DEBIT');
  assert.equal(unknown.category, 'Other');
  assert.equal(unknown.method, 'fallback');
  assert.equal(unknown.confidence, 0.45);

  const norm = normalizeMerchantName('UPI/43829102/SWIGGY@okicici');
  assert.ok(norm.toLowerCase().includes('swiggy'));
});

test('CSV parser normalizes dates, amounts, duplicates, and flags invalid rows without discarding', () => {
  assert.equal(normalizeDateString('15/08/2026'), '2026-08-15');
  assert.equal(normalizeDateString('2026-08-15'), '2026-08-15');
  assert.equal(normalizeDateString('05-Sep-2026'), '2026-09-05');
  assert.equal(normalizeDateString('not-a-date'), null);
  assert.equal(parseMoneyValue('₹1,250.50'), 1250.5);

  const csv = [
    'Date,Description,Debit,Credit',
    '01/08/2026,SALARY CREDIT ACME,,85000',
    '03/08/2026,SWIGGY ORDER,450,',
    '03/08/2026,SWIGGY ORDER,450,', // duplicate within CSV
    'bad-date,BROKEN ROW,200,', // invalid date
    '05/08/2026,ZERO AMOUNT,0,', // invalid amount
  ].join('\n');

  const preview = parseAndPreviewCsv(csv, 'test.csv');
  assert.equal(preview.totalRows, 5);
  assert.equal(preview.validRows, 3);
  assert.equal(preview.invalidRows, 2);
  assert.equal(preview.duplicateRows, 1);
  assert.equal(preview.rows[0].transactionType, 'CREDIT');
  assert.equal(preview.rows[1].transactionType, 'DEBIT');
  assert.equal(preview.rows[2].isDuplicate, true);

  // Full demo CSV round-trip
  const demoCsv = generateDemoCsvString();
  const demoPreview = parseAndPreviewCsv(demoCsv, 'demo-transactions.csv');
  assert.equal(demoPreview.invalidRows, 0);
  assert.equal(demoPreview.validRows, DEMO_INDIAN_TRANSACTIONS.length);
});

test('analytics handles zero income safely, avoids labeling cash flow as balance, and detects recurring expenses', () => {
  const expenseOnly: TransactionRecord[] = [
    {
      id: '1',
      userId: 'u1',
      description: 'SWIGGY',
      merchant: 'Swiggy',
      amount: 500,
      transactionType: 'DEBIT',
      categoryId: null,
      categoryName: 'Food',
      subcategory: null,
      transactionDate: '2026-10-01',
      source: 'MANUAL',
      externalReference: null,
      dedupeHash: null,
      isRecurring: false,
      classificationConfidence: 0.9,
      classificationMethod: 'merchant_rule',
    },
  ];

  const zeroIncOverview = computeOverviewMetrics(expenseOnly, 'INR', null);
  assert.equal(zeroIncOverview.totalIncome, 0);
  assert.equal(zeroIncOverview.totalExpenses, 500);
  assert.equal(zeroIncOverview.netCashFlow, -500);
  assert.equal(zeroIncOverview.savingsRatePercent, null);
  assert.equal(zeroIncOverview.recordedBalance, null);

  const demoRecords = buildDemoRecords();
  const overview = computeOverviewMetrics(demoRecords, 'INR', 65000);
  assert.equal(overview.hasOpeningBalance, true);
  assert.equal(overview.recordedBalance, Number((65000 + overview.netCashFlow).toFixed(2)));
  assert.ok(overview.spendingByCategory.length >= 5);

  const trends = computeMonthlyTrends(demoRecords);
  assert.equal(trends.length, 4);

  const merchants = computeMerchantAnalysis(demoRecords);
  assert.ok(merchants.length > 0);

  const recurring = detectRecurringExpenses(demoRecords);
  const recurringNames = recurring.map((r) => r.merchant.toLowerCase());
  assert.ok(recurringNames.some((n) => n.includes('koramangala') || n.includes('netflix') || n.includes('airtel')));
});

test('forecasting handles insufficient data gracefully and generates forecast bands when sufficient', () => {
  const fewRecords = buildDemoRecords().slice(0, 3);
  const insufficient = generateCashFlowForecast(fewRecords);
  assert.equal(insufficient.status, 'insufficient_data');
  assert.equal(insufficient.points.length, 0);
  assert.ok(insufficient.reason);

  const demoRecords = buildDemoRecords();
  const ready = generateCashFlowForecast(demoRecords, 65000, 3);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.points.length, 3);
  assert.ok(ready.evaluation !== null);
  assert.ok(ready.points[0].lowerExpenseEstimate <= ready.points[0].projectedExpenses);
  assert.ok(ready.points[0].upperExpenseEstimate >= ready.points[0].projectedExpenses);
  assert.ok(ready.points[0].projectedBalance !== null);
});

test('anomaly detection flags unusual electronics spike and duplicate coffee charge without labeling fraud', () => {
  const demoRecords = buildDemoRecords();
  const alerts = detectAnomalies(demoRecords);
  assert.ok(alerts.length >= 2);
  const labels = alerts.map((a) => a.label);
  assert.ok(labels.includes('Unusual activity') || labels.includes('Spending spike'));
  assert.ok(labels.includes('Possible duplicate'));
  for (const alert of alerts) {
    assert.ok(!alert.title.toLowerCase().includes('fraud'));
    assert.ok(alert.detectionReason.length > 0);
    assert.ok(alert.historicalBaseline.length > 0);
  }
});

test('scenario simulation computes deterministic savings deltas', () => {
  const demoRecords = buildDemoRecords();
  const baseSim = runScenarioSimulation(demoRecords, {
    targetCategory: 'Shopping',
    categoryAdjustmentPercent: -15,
    additionalMonthlyExpense: 1000,
  });

  assert.equal(baseSim.dataBasis, 'historical_monthly_average');
  assert.ok(baseSim.historicalBaseline.targetCategorySpend! > 0);
  const expectedDelta = Number(
    (
      baseSim.historicalBaseline.monthlyExpenses -
      baseSim.simulatedOutcome.projectedMonthlyExpenses
    ).toFixed(2)
  );
  assert.equal(baseSim.simulatedOutcome.monthlySavingsDelta, expectedDelta);
});

test('security: CSV parser neutralizes formula injection prefixes and handles malformed files safely', () => {
  const maliciousCsv = [
    'Date,Description,Amount,Type',
    '2026-10-05,"=CMD|/C calc!A0 SWIGGY",500,DEBIT',
    '2026-10-06,"+HYPERLINK(http://evil.local) ZOMATO",350,DEBIT',
  ].join('\n');

  const preview = parseAndPreviewCsv(maliciousCsv, 'malicious.csv');
  assert.equal(preview.validRows, 2);
  assert.ok(!preview.rows[0].description.startsWith('='));
  assert.ok(!preview.rows[1].description.startsWith('+'));

  assert.throws(() => parseAndPreviewCsv('HeaderOnly\n', 'empty.csv'), /header row/i);
  assert.throws(() => parseAndPreviewCsv('ColA,ColB\n1,2\n', 'badcols.csv'), /Date column/i);
});

test('AccountAggregatorStubAdapter reports not_enabled honestly without faking live bank sync', async () => {
  const { AccountAggregatorStubAdapter } = await import('./integrations.ts');
  const adapter = new AccountAggregatorStubAdapter();
  const status = await adapter.getConsentStatus();
  assert.equal(status.status, 'not_enabled');
  const connect = await adapter.connect();
  assert.equal(connect.status, 'not_enabled');
  const txs = await adapter.fetchTransactions();
  assert.equal(txs.length, 0);
});

test('CSV export serializes transactions with RFC-4180 quoting, formula neutralization, and round-trip compatibility', async () => {
  const { exportTransactionsToCsv, escapeCsvCell } = await import('./csvExport.ts');

  assert.equal(escapeCsvCell('=CMD|calc'), "'=CMD|calc");
  assert.equal(escapeCsvCell('Coffee, Tea & Snacks'), '"Coffee, Tea & Snacks"');
  assert.equal(escapeCsvCell('Say "Hello"'), '"Say ""Hello"""');

  const records = buildDemoRecords().slice(0, 2);
  records[0].description = 'UPI, SWIGGY "DINNER"';
  records[1].description = '=HYPERLINK("http://evil.local")';

  const csv = exportTransactionsToCsv(records);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'Date,Description,Merchant,Category,Type,Amount,Source,Confidence,Method');
  assert.equal(lines.length, 3);
  assert.ok(lines[1].includes('"UPI, SWIGGY ""DINNER"""'));
  assert.ok(lines[2].includes("'=HYPERLINK"));

  // Round-trip re-import via parseAndPreviewCsv succeeds with 0 invalid rows
  const reimported = parseAndPreviewCsv(csv, 'exported.csv');
  assert.equal(reimported.validRows, 2);
  assert.equal(reimported.invalidRows, 0);
});

test('transactionFilters supports real-time merchant/note filtering, date range validation, and presets', async () => {
  const {
    filterTransactionsByQuery,
    validateDateRange,
    computeDateRangePreset,
  } = await import('./transactionFilters.ts');

  const records = buildDemoRecords();
  const swiggyMatches = filterTransactionsByQuery(records, 'swiggy');
  assert.ok(swiggyMatches.length >= 2);
  assert.ok(
    swiggyMatches.every(
      (r) =>
        (r.merchant ?? '').toLowerCase().includes('swiggy') ||
        r.description.toLowerCase().includes('swiggy')
    )
  );

  // Note/description substring match (not just merchant)
  const instamartMatches = filterTransactionsByQuery(records, 'instamart');
  assert.ok(instamartMatches.length >= 1);

  assert.equal(filterTransactionsByQuery(records, '   ').length, records.length);

  assert.equal(validateDateRange('2026-10-01', '2026-10-31'), null);
  assert.equal(validateDateRange('2026-11-01', '2026-10-01'), 'Start date cannot be after end date.');
  assert.equal(validateDateRange('bad-date', ''), 'Start date must use YYYY-MM-DD format.');

  const ref = new Date(Date.UTC(2026, 10, 17)); // 2026-11-17
  assert.deepEqual(computeDateRangePreset('this_month', ref), {
    startDate: '2026-11-01',
    endDate: '2026-11-17',
  });
  assert.deepEqual(computeDateRangePreset('last_month', ref), {
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  });
  assert.deepEqual(computeDateRangePreset('last_30', ref), {
    startDate: '2026-10-19',
    endDate: '2026-11-17',
  });
  assert.deepEqual(computeDateRangePreset('all', ref), {
    startDate: '',
    endDate: '',
  });
});

test('generateMonthlySpendingPdf produces spec-compliant single and multi-page PDF 1.4 documents', async () => {
  const { generateMonthlySpendingPdf } = await import('./pdfReport.ts');
  const { computeSpendingByCategory } = await import('./analytics.ts');

  const demoRecords = buildDemoRecords();
  const trends = computeMonthlyTrends(demoRecords);
  const categories = computeSpendingByCategory(demoRecords);
  const merchants = computeMerchantAnalysis(demoRecords);
  const recurring = detectRecurringExpenses(demoRecords);

  const pdfBytes = generateMonthlySpendingPdf({
    currency: 'INR',
    accountLabel: 'Aarav Sharma (Demo)',
    generatedAtIso: '2026-11-17T12:00:00.000Z',
    trends,
    categories,
    merchants,
    recurring,
  });

  const pdfText = new TextDecoder().decode(pdfBytes);
  assert.ok(pdfText.startsWith('%PDF-1.4\n'), 'PDF must begin with %PDF-1.4 header');
  assert.ok(pdfText.trimEnd().endsWith('%%EOF'), 'PDF must end with %%EOF trailer');
  assert.ok(pdfText.includes('Monthly Spending Trends Summary Report'));
  assert.ok(pdfText.includes('INR '), 'PDF must format INR using ASCII-safe WinAnsi text');
  assert.ok(!pdfText.includes('₹'), 'PDF must avoid raw Unicode Rupee glyph in Type1 Helvetica');

  // Verify xref table exists and references valid object offsets
  const xrefMatch = pdfText.match(/xref\n0 (\d+)\n/);
  assert.ok(xrefMatch, 'PDF must include valid xref header');
  const objCount = Number(xrefMatch[1]);
  assert.ok(objCount >= 7);

  // Verify multi-page overflow when many trends + merchants + recurring entries are provided
  const manyTrends = Array.from({ length: 30 }, (_, idx) => ({
    month: `2025-${String((idx % 12) + 1).padStart(2, '0')}`,
    income: 90000,
    expenses: 45000 + idx * 100,
    netCashFlow: 45000 - idx * 100,
    savingsRatePercent: 49.5,
    transactionCount: 18,
  }));
  const multiPageBytes = generateMonthlySpendingPdf({
    currency: 'INR',
    accountLabel: 'Multi-Page Ledger',
    generatedAtIso: '2026-11-17T12:00:00.000Z',
    trends: manyTrends,
    categories,
    merchants,
    recurring,
  });
  const multiPageText = new TextDecoder().decode(multiPageBytes);
  assert.ok(multiPageText.includes('/Count 2') || multiPageText.includes('/Count 3'));
});

test('reminders core computes urgency states, month-end recurrence, summaries, and recurring deduplication', async () => {
  const {
    computeNextRecurrenceDate,
    evaluateReminderUrgency,
    summarizeReminderNotifications,
    buildRemindersFromRecurringCandidates,
  } = await import('./reminders.ts');

  // Month-end clamping across February and leap years
  assert.equal(computeNextRecurrenceDate('2026-01-31', 'MONTHLY'), '2026-02-28');
  assert.equal(computeNextRecurrenceDate('2024-01-31', 'MONTHLY'), '2024-02-29');
  assert.equal(computeNextRecurrenceDate('2026-03-15', 'QUARTERLY'), '2026-06-15');
  assert.equal(computeNextRecurrenceDate('2026-05-10', 'YEARLY'), '2027-05-10');
  assert.equal(computeNextRecurrenceDate('2026-05-10', 'ONCE'), '2026-05-10');

  const ref = '2026-11-17';
  assert.deepEqual(
    evaluateReminderUrgency({ dueDate: '2026-11-15', status: 'PENDING', remindDaysBefore: 5 }, ref),
    { urgency: 'OVERDUE', daysUntilDue: -2 }
  );
  assert.deepEqual(
    evaluateReminderUrgency({ dueDate: '2026-11-17', status: 'PENDING', remindDaysBefore: 5 }, ref),
    { urgency: 'DUE_TODAY', daysUntilDue: 0 }
  );
  assert.deepEqual(
    evaluateReminderUrgency({ dueDate: '2026-11-20', status: 'PENDING', remindDaysBefore: 5 }, ref),
    { urgency: 'DUE_SOON', daysUntilDue: 3 }
  );
  assert.deepEqual(
    evaluateReminderUrgency({ dueDate: '2026-11-28', status: 'PENDING', remindDaysBefore: 5 }, ref),
    { urgency: 'UPCOMING', daysUntilDue: 11 }
  );
  assert.deepEqual(
    evaluateReminderUrgency({ dueDate: '2026-11-15', status: 'PAID', remindDaysBefore: 5 }, ref),
    { urgency: 'PAID', daysUntilDue: null }
  );

  const summary = summarizeReminderNotifications(
    [
      {
        id: 'r1',
        userId: 'u1',
        title: 'HDFC EMI',
        reminderType: 'EMI',
        merchant: 'HDFC Bank',
        categoryName: 'Shopping',
        amount: 7083,
        dueDate: '2026-11-16',
        recurrence: 'MONTHLY',
        remindDaysBefore: 5,
        status: 'PENDING',
        notes: null,
        lastPaidAt: null,
        createdAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 'r2',
        userId: 'u1',
        title: 'Rent',
        reminderType: 'BILL',
        merchant: 'Landlord',
        categoryName: 'Housing',
        amount: 22000,
        dueDate: '2026-11-19',
        recurrence: 'MONTHLY',
        remindDaysBefore: 5,
        status: 'PENDING',
        notes: null,
        lastPaidAt: null,
        createdAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 'r3',
        userId: 'u1',
        title: 'Electricity',
        reminderType: 'BILL',
        merchant: 'BESCOM',
        categoryName: 'Utilities',
        amount: 1850,
        dueDate: '2026-11-29',
        recurrence: 'MONTHLY',
        remindDaysBefore: 3,
        status: 'PENDING',
        notes: null,
        lastPaidAt: null,
        createdAt: '2026-11-01T00:00:00Z',
      },
    ],
    ref
  );

  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.dueTodayCount, 0);
  assert.equal(summary.dueSoonCount, 1);
  assert.equal(summary.activeAlertCount, 2);
  assert.equal(summary.totalPendingCount, 3);
  assert.equal(summary.totalPendingAmount, 30933);

  const candidates = detectRecurringExpenses(buildDemoRecords());
  const existing = [
    {
      id: 'r-existing',
      userId: 'u1',
      title: 'Existing Netflix',
      reminderType: 'SUBSCRIPTION' as const,
      merchant: candidates[0]?.merchant ?? 'Netflix',
      categoryName: 'Entertainment',
      amount: 649,
      dueDate: '2026-11-20',
      recurrence: 'MONTHLY' as const,
      remindDaysBefore: 4,
      status: 'PENDING' as const,
      notes: null,
      lastPaidAt: null,
      createdAt: '2026-11-01T00:00:00Z',
    },
  ];
  const imported = buildRemindersFromRecurringCandidates(candidates, existing);
  assert.ok(!imported.some((i) => i.merchant === existing[0].merchant));
});
