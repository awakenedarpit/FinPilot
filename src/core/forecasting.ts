import { computeMonthlyTrends, detectRecurringExpenses } from './analytics.ts';
import type { ForecastOutput, ForecastPoint, TransactionRecord } from './types.ts';

const MODEL_VERSION = 'ewma-recurring-v1.0';
const MINIMUM_REQUIRED_MONTHS = 2;

function round2(n: number): number {
  return Number(n.toFixed(2));
}

function addMonths(ym: string, offset: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function ewma(values: number[], alpha = 0.45): number {
  if (values.length === 0) return 0;
  let level = values[0];
  for (let i = 1; i < values.length; i++) {
    level = alpha * values[i] + (1 - alpha) * level;
  }
  return level;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function generateCashFlowForecast(
  transactions: TransactionRecord[],
  openingBalance: number | null = null,
  horizonMonths = 3
): ForecastOutput {
  const generatedAt = new Date().toISOString();
  const trends = computeMonthlyTrends(transactions);
  const recurring = detectRecurringExpenses(transactions);
  const recurringMonthlyCommitments = round2(
    recurring.reduce((sum, r) => sum + r.averageAmount, 0)
  );

  // Estimate recurring monthly income from salary/consistent monthly credits
  const monthlyIncomes = trends.map((t) => t.income);
  const nonZeroIncomes = monthlyIncomes.filter((i) => i > 0);
  const recurringMonthlyIncome =
    nonZeroIncomes.length >= 2
      ? round2(nonZeroIncomes.reduce((s, v) => s + v, 0) / nonZeroIncomes.length)
      : nonZeroIncomes[0] ?? 0;

  if (trends.length < MINIMUM_REQUIRED_MONTHS || transactions.length < 6) {
    return {
      status: 'insufficient_data',
      reason: `At least ${MINIMUM_REQUIRED_MONTHS} distinct calendar months and 6 transactions are required to compute a statistical forecast. Currently observed: ${trends.length} month(s) and ${transactions.length} transaction(s).`,
      modelVersion: MODEL_VERSION,
      generatedAt,
      observedMonths: trends.length,
      minimumRequiredMonths: MINIMUM_REQUIRED_MONTHS,
      recurringMonthlyCommitments,
      recurringMonthlyIncome,
      points: [],
      evaluation: null,
    };
  }

  const expensesSeries = trends.map((t) => t.expenses);
  const incomeSeries = trends.map((t) => t.income);

  const predictedExpenseBase = ewma(expensesSeries, 0.45);
  const predictedIncomeBase = ewma(incomeSeries, 0.45);

  const expStd = stdDev(expensesSeries);
  const incStd = stdDev(incomeSeries);

  // Holdout backtest on the last observed month when >= 3 months exist
  let evaluation: ForecastOutput['evaluation'] = null;
  if (trends.length >= 3) {
    const trainExpenses = expensesSeries.slice(0, -1);
    const holdoutActual = expensesSeries[expensesSeries.length - 1];
    const holdoutPred = round2(ewma(trainExpenses, 0.45));
    const mapePercent =
      holdoutActual > 0
        ? round2((Math.abs(holdoutActual - holdoutPred) / holdoutActual) * 100)
        : null;
    evaluation = {
      holdoutMonth: trends[trends.length - 1].month,
      actualExpenses: holdoutActual,
      predictedExpenses: holdoutPred,
      mapePercent,
    };
  }

  // Only project balance if openingBalance is explicitly known
  let runningBalance: number | null =
    openingBalance !== null && Number.isFinite(openingBalance)
      ? round2(
          openingBalance +
            transactions.reduce(
              (acc, t) => acc + (t.transactionType === 'CREDIT' ? t.amount : -t.amount),
              0
            )
        )
      : null;

  const lastMonth = trends[trends.length - 1].month;
  const points: ForecastPoint[] = [];

  for (let h = 1; h <= horizonMonths; h++) {
    const targetMonth = addMonths(lastMonth, h);
    // Uncertainty widens slightly with forecast horizon sqrt(h)
    const uncertaintyScale = 1.28 * Math.sqrt(h);
    const expMargin = Math.max(predictedExpenseBase * 0.08, uncertaintyScale * expStd);
    const netStd = Math.sqrt(expStd ** 2 + incStd ** 2);
    const netMargin = Math.max(Math.abs(predictedIncomeBase - predictedExpenseBase) * 0.12, uncertaintyScale * netStd);

    const projectedExpenses = round2(Math.max(recurringMonthlyCommitments, predictedExpenseBase));
    const projectedIncome = round2(Math.max(0, predictedIncomeBase));
    const projectedNetCashFlow = round2(projectedIncome - projectedExpenses);

    if (runningBalance !== null) {
      runningBalance = round2(runningBalance + projectedNetCashFlow);
    }

    points.push({
      month: targetMonth,
      projectedIncome,
      projectedExpenses,
      projectedNetCashFlow,
      projectedBalance: runningBalance,
      lowerExpenseEstimate: round2(Math.max(0, projectedExpenses - expMargin)),
      upperExpenseEstimate: round2(projectedExpenses + expMargin),
      lowerNetEstimate: round2(projectedNetCashFlow - netMargin),
      upperNetEstimate: round2(projectedNetCashFlow + netMargin),
    });
  }

  return {
    status: 'ready',
    reason: null,
    modelVersion: MODEL_VERSION,
    generatedAt,
    observedMonths: trends.length,
    minimumRequiredMonths: MINIMUM_REQUIRED_MONTHS,
    recurringMonthlyCommitments,
    recurringMonthlyIncome,
    points,
    evaluation,
  };
}
