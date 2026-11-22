import { getMonthKey } from './analytics.ts';
import type { AnomalyAlert, TransactionRecord } from './types.ts';

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function computeStats(values: number[]): { median: number; mad: number; q1: number; q3: number; iqr: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const med = median(sorted);
  const deviations = sorted.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = median(deviations);
  const mid = Math.floor(sorted.length / 2);
  const lowerHalf = sorted.slice(0, mid);
  const upperHalf = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
  const q1 = lowerHalf.length > 0 ? median(lowerHalf) : sorted[0] ?? 0;
  const q3 = upperHalf.length > 0 ? median(upperHalf) : sorted[sorted.length - 1] ?? 0;
  return {
    median: Number(med.toFixed(2)),
    mad: Number(mad.toFixed(2)),
    q1: Number(q1.toFixed(2)),
    q3: Number(q3.toFixed(2)),
    iqr: Number((q3 - q1).toFixed(2)),
  };
}

export function detectAnomalies(transactions: TransactionRecord[]): AnomalyAlert[] {
  const debits = transactions.filter((t) => t.transactionType === 'DEBIT');
  if (debits.length < 4) {
    return [];
  }

  const alerts: AnomalyAlert[] = [];
  const seenAlertKeys = new Set<string>();

  const globalStats = computeStats(debits.map((d) => d.amount));
  const scaledMad = globalStats.mad * 1.4826;
  const globalUpperIqr = globalStats.q3 + 1.5 * Math.max(globalStats.iqr, globalStats.median * 0.35);
  const globalUpperMad = globalStats.median + 3.2 * Math.max(scaledMad, globalStats.median * 0.35);
  const globalThreshold = Math.max(globalUpperIqr, globalUpperMad, globalStats.median * 2.5);

  // 1. Unusually large individual transactions (exclude Housing/Rent & Education tuition unless extreme)
  const byCategory = new Map<string, TransactionRecord[]>();
  for (const tx of debits) {
    if (!byCategory.has(tx.categoryName)) byCategory.set(tx.categoryName, []);
    byCategory.get(tx.categoryName)!.push(tx);
  }

  for (const tx of debits) {
    const catTxs = byCategory.get(tx.categoryName) ?? [];
    if (tx.categoryName === 'Housing' && catTxs.length >= 2) {
      // Check against rent baseline only
      const catStats = computeStats(catTxs.map((c) => c.amount));
      if (tx.amount <= catStats.median * 1.4) continue;
    }

    let isOutlier = false;
    let baselineText = '';
    let baselineMedian = globalStats.median;
    let baselineIqr = globalStats.iqr;

    if (catTxs.length >= 4) {
      const catStats = computeStats(catTxs.map((c) => c.amount));
      const catUpper = Math.max(
        catStats.q3 + 1.75 * Math.max(catStats.iqr, catStats.median * 0.3),
        catStats.median * 3
      );
      if (tx.amount > catUpper && tx.amount > 2500) {
        isOutlier = true;
        baselineMedian = catStats.median;
        baselineIqr = catStats.iqr;
        baselineText = `${tx.categoryName} median is ${catStats.median.toFixed(0)} (IQR ${catStats.iqr.toFixed(0)})`;
      }
    } else if (tx.amount > globalThreshold && tx.amount > 5000 && tx.categoryName !== 'Housing') {
      isOutlier = true;
      baselineText = `Overall debit median is ${globalStats.median.toFixed(0)} (IQR ${globalStats.iqr.toFixed(0)})`;
    }

    if (isOutlier) {
      const multiplier = Number((tx.amount / Math.max(1, baselineMedian)).toFixed(1));
      const key = `outlier:${tx.id}`;
      if (!seenAlertKeys.has(key)) {
        seenAlertKeys.add(key);
        alerts.push({
          id: key,
          transactionId: tx.id,
          label: 'Unusual activity',
          title: `Unusually large ${tx.categoryName} expense at ${tx.merchant || tx.description}`,
          description: `Recorded ${tx.amount.toFixed(2)} on ${tx.transactionDate}, which is ${multiplier}x your typical ${tx.categoryName.toLowerCase()} baseline.`,
          severity: multiplier >= 5 ? 'HIGH' : 'MEDIUM',
          detectionReason: `Exceeds IQR/MAD upper threshold (${multiplier}x median)`,
          historicalBaseline: baselineText,
          evidence: {
            amount: tx.amount,
            baselineMedian,
            baselineIqr,
            category: tx.categoryName,
            merchant: tx.merchant || tx.description,
            transactionDate: tx.transactionDate,
            multiplier,
          },
        });
      }
    }
  }

  // 2. Possible duplicate-looking transactions (same amount + merchant within 2 days)
  const sortedDebits = [...debits].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
  for (let i = 0; i < sortedDebits.length; i++) {
    for (let j = i + 1; j < sortedDebits.length; j++) {
      const a = sortedDebits[i];
      const b = sortedDebits[j];
      const dayDiff = Math.round(
        (Date.parse(b.transactionDate) - Date.parse(a.transactionDate)) / 86400000
      );
      if (dayDiff > 2) break;

      const merchantA = (a.merchant || a.description).toLowerCase().trim();
      const merchantB = (b.merchant || b.description).toLowerCase().trim();
      if (Math.abs(a.amount - b.amount) < 0.01 && merchantA === merchantB) {
        const key = `dup:${b.id}`;
        if (!seenAlertKeys.has(key)) {
          seenAlertKeys.add(key);
          alerts.push({
            id: key,
            transactionId: b.id,
            label: 'Possible duplicate',
            title: `Possible duplicate charge at ${b.merchant || b.description}`,
            description: `Two charges of ${b.amount.toFixed(2)} appeared within ${dayDiff} day(s) (${a.transactionDate} and ${b.transactionDate}).`,
            severity: 'MEDIUM',
            detectionReason: 'Matching merchant and identical amount within 48 hours',
            historicalBaseline: `Prior matching charge on ${a.transactionDate}`,
            evidence: {
              amount: b.amount,
              category: b.categoryName,
              merchant: b.merchant || b.description,
              transactionDate: b.transactionDate,
            },
          });
        }
      }
    }
  }

  // 3. Category spending spikes in the latest month vs prior months
  const months = Array.from(new Set(debits.map((d) => getMonthKey(d.transactionDate)))).sort();
  if (months.length >= 2) {
    const latestMonth = months[months.length - 1];
    const priorMonths = months.slice(0, -1);

    for (const [category, catTxs] of byCategory.entries()) {
      if (category === 'Housing' || category === 'Education') continue;
      const latestTotal = catTxs
        .filter((t) => getMonthKey(t.transactionDate) === latestMonth)
        .reduce((s, t) => s + t.amount, 0);

      const priorMonthlyTotals = priorMonths
        .map((m) =>
          catTxs
            .filter((t) => getMonthKey(t.transactionDate) === m)
            .reduce((s, t) => s + t.amount, 0)
        )
        .filter((total) => total > 0);

      if (priorMonthlyTotals.length === 0) continue;
      const priorAvg = priorMonthlyTotals.reduce((s, v) => s + v, 0) / priorMonthlyTotals.length;

      if (latestTotal > priorAvg * 1.45 && latestTotal - priorAvg > 1500) {
        const multiplier = Number((latestTotal / priorAvg).toFixed(2));
        const key = `spike:${category}:${latestMonth}`;
        if (!seenAlertKeys.has(key)) {
          seenAlertKeys.add(key);
          alerts.push({
            id: key,
            transactionId: null,
            label: 'Spending spike',
            title: `${category} spending spike in ${latestMonth}`,
            description: `${category} spend reached ${latestTotal.toFixed(2)} in ${latestMonth}, compared to a prior monthly average of ${priorAvg.toFixed(2)}.`,
            severity: multiplier >= 2 ? 'HIGH' : 'MEDIUM',
            detectionReason: `Latest monthly category total is ${multiplier}x prior average`,
            historicalBaseline: `Prior ${priorMonthlyTotals.length}-month average: ${priorAvg.toFixed(2)}`,
            evidence: {
              amount: Number(latestTotal.toFixed(2)),
              baselineMedian: Number(priorAvg.toFixed(2)),
              category,
              multiplier,
            },
          });
        }
      }
    }
  }

  const severityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
