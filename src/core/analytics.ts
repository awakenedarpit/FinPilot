import type {
  CategorySpendSummary,
  MerchantSummary,
  MonthlyTrendPoint,
  OverviewMetrics,
  RecurringCandidate,
  TransactionRecord,
} from './types.ts';

function round2(n: number): number {
  return Number(n.toFixed(2));
}

export function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

export function computeMonthlyTrends(transactions: TransactionRecord[]): MonthlyTrendPoint[] {
  const byMonth = new Map<string, { income: number; expenses: number; count: number }>();

  for (const tx of transactions) {
    const month = getMonthKey(tx.transactionDate);
    if (!byMonth.has(month)) {
      byMonth.set(month, { income: 0, expenses: 0, count: 0 });
    }
    const bucket = byMonth.get(month)!;
    bucket.count += 1;
    if (tx.transactionType === 'CREDIT') {
      bucket.income += tx.amount;
    } else {
      bucket.expenses += tx.amount;
    }
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => {
      const income = round2(data.income);
      const expenses = round2(data.expenses);
      const netCashFlow = round2(income - expenses);
      const savingsRatePercent =
        income > 0 ? round2(((income - expenses) / income) * 100) : null;
      return {
        month,
        income,
        expenses,
        netCashFlow,
        savingsRatePercent,
        transactionCount: data.count,
      };
    });
}

export function computeSpendingByCategory(transactions: TransactionRecord[]): CategorySpendSummary[] {
  const debits = transactions.filter((t) => t.transactionType === 'DEBIT');
  const totalExpenses = debits.reduce((sum, t) => sum + t.amount, 0);
  const byCat = new Map<string, { total: number; count: number }>();

  for (const tx of debits) {
    const cat = tx.categoryName || 'Other';
    if (!byCat.has(cat)) {
      byCat.set(cat, { total: 0, count: 0 });
    }
    const entry = byCat.get(cat)!;
    entry.total += tx.amount;
    entry.count += 1;
  }

  return Array.from(byCat.entries())
    .map(([category, stats]) => ({
      category,
      total: round2(stats.total),
      count: stats.count,
      sharePercent: totalExpenses > 0 ? round2((stats.total / totalExpenses) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export function computeOverviewMetrics(
  transactions: TransactionRecord[],
  currency = 'INR',
  openingBalance: number | null = null
): OverviewMetrics {
  let totalIncome = 0;
  let totalExpenses = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;
  let hasDemoData = false;

  for (const tx of transactions) {
    if (tx.source === 'DEMO') hasDemoData = true;
    if (tx.transactionType === 'CREDIT') {
      totalIncome += tx.amount;
    } else {
      totalExpenses += tx.amount;
    }
    if (!minDate || tx.transactionDate < minDate) minDate = tx.transactionDate;
    if (!maxDate || tx.transactionDate > maxDate) maxDate = tx.transactionDate;
  }

  totalIncome = round2(totalIncome);
  totalExpenses = round2(totalExpenses);
  const netCashFlow = round2(totalIncome - totalExpenses);

  const trends = computeMonthlyTrends(transactions);
  const latest = trends.length > 0 ? trends[trends.length - 1] : null;
  const previous = trends.length > 1 ? trends[trends.length - 2] : null;

  const currentMonthIncome = latest ? latest.income : 0;
  const currentMonthExpenses = latest ? latest.expenses : 0;
  const currentMonthSavings = round2(currentMonthIncome - currentMonthExpenses);

  // Only compute savings rate when income > 0 to avoid division errors
  const savingsRatePercent =
    currentMonthIncome > 0
      ? round2(((currentMonthIncome - currentMonthExpenses) / currentMonthIncome) * 100)
      : totalIncome > 0
        ? round2(((totalIncome - totalExpenses) / totalIncome) * 100)
        : null;

  const monthOverMonthExpenseChangePercent =
    latest && previous && previous.expenses > 0
      ? round2(((latest.expenses - previous.expenses) / previous.expenses) * 100)
      : null;

  const monthOverMonthIncomeChangePercent =
    latest && previous && previous.income > 0
      ? round2(((latest.income - previous.income) / previous.income) * 100)
      : null;

  // Balance is only calculated when opening balance is explicitly provided
  const hasOpeningBalance = openingBalance !== null && Number.isFinite(openingBalance);
  const recordedBalance = hasOpeningBalance ? round2(openingBalance + netCashFlow) : null;

  return {
    currency,
    totalIncome,
    totalExpenses,
    netCashFlow,
    currentMonthIncome,
    currentMonthExpenses,
    currentMonthSavings,
    savingsRatePercent,
    recordedBalance,
    hasOpeningBalance,
    monthOverMonthExpenseChangePercent,
    monthOverMonthIncomeChangePercent,
    latestMonth: latest ? latest.month : null,
    previousMonth: previous ? previous.month : null,
    transactionCount: transactions.length,
    dateRange: { start: minDate, end: maxDate },
    spendingByCategory: computeSpendingByCategory(transactions),
    hasDemoData,
  };
}

export function computeMerchantAnalysis(transactions: TransactionRecord[]): MerchantSummary[] {
  const debits = transactions.filter((t) => t.transactionType === 'DEBIT');
  const map = new Map<string, { total: number; count: number; categories: Map<string, number> }>();

  for (const tx of debits) {
    const merchant = (tx.merchant || tx.description).trim();
    if (!map.has(merchant)) {
      map.set(merchant, { total: 0, count: 0, categories: new Map() });
    }
    const entry = map.get(merchant)!;
    entry.total += tx.amount;
    entry.count += 1;
    entry.categories.set(tx.categoryName, (entry.categories.get(tx.categoryName) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([merchant, data]) => {
      const primaryCategory =
        Array.from(data.categories.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Other';
      return {
        merchant,
        total: round2(data.total),
        count: data.count,
        avgAmount: round2(data.total / data.count),
        primaryCategory,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function detectRecurringExpenses(transactions: TransactionRecord[]): RecurringCandidate[] {
  const debits = transactions.filter((t) => t.transactionType === 'DEBIT');
  const groups = new Map<string, TransactionRecord[]>();

  for (const tx of debits) {
    const key = (tx.merchant || tx.description).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  }

  const candidates: RecurringCandidate[] = [];

  for (const [, list] of groups.entries()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
    const distinctMonths = new Set(sorted.map((t) => getMonthKey(t.transactionDate)));
    if (distinctMonths.size < 2) continue;

    // Check intervals between distinct-month occurrences
    const dayDiffs: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prevMs = Date.parse(sorted[i - 1].transactionDate);
      const currMs = Date.parse(sorted[i].transactionDate);
      const diffDays = Math.round((currMs - prevMs) / (1000 * 60 * 60 * 24));
      if (diffDays >= 20) dayDiffs.push(diffDays);
    }

    if (dayDiffs.length === 0) continue;

    const avgCadence = Math.round(dayDiffs.reduce((s, d) => s + d, 0) / dayDiffs.length);
    if (avgCadence < 22 || avgCadence > 40) continue;

    const amounts = sorted.map((t) => t.amount);
    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - avgAmount) / (avgAmount || 1)));

    // Allow up to 25% variance (utilities/bills fluctuate slightly, rent/subscriptions are exact)
    if (maxDeviation > 0.25) continue;

    const lastTx = sorted[sorted.length - 1];
    const nextDate = new Date(Date.parse(lastTx.transactionDate) + avgCadence * 86400000)
      .toISOString()
      .slice(0, 10);

    candidates.push({
      merchant: lastTx.merchant || lastTx.description,
      category: lastTx.categoryName,
      averageAmount: round2(avgAmount),
      occurrences: sorted.length,
      cadenceDays: avgCadence,
      lastDate: lastTx.transactionDate,
      nextEstimatedDate: nextDate,
    });
  }

  return candidates.sort((a, b) => b.averageAmount - a.averageAmount);
}
