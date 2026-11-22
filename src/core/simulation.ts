import { computeMonthlyTrends, computeSpendingByCategory, getMonthKey } from './analytics.ts';
import type { SimulationInput, SimulationOutput, TransactionRecord } from './types.ts';

function round2(n: number): number {
  return Number(n.toFixed(2));
}

export function runScenarioSimulation(
  transactions: TransactionRecord[],
  input: SimulationInput
): SimulationOutput {
  if (transactions.length === 0) {
    return {
      dataBasis: 'no_transactions',
      baselineMonthLabel: null,
      historicalBaseline: {
        monthlyIncome: 0,
        monthlyExpenses: 0,
        monthlySavings: 0,
        savingsRatePercent: null,
        targetCategorySpend: null,
      },
      hypotheticalAdjustments: input,
      simulatedOutcome: {
        projectedMonthlyIncome: round2(input.additionalMonthlyIncome ?? 0),
        projectedMonthlyExpenses: round2(Math.max(0, input.additionalMonthlyExpense ?? 0)),
        projectedMonthlySavings: round2(
          (input.additionalMonthlyIncome ?? 0) - Math.max(0, input.additionalMonthlyExpense ?? 0)
        ),
        monthlySavingsDelta: round2(
          (input.additionalMonthlyIncome ?? 0) - Math.max(0, input.additionalMonthlyExpense ?? 0)
        ),
        annualSavingsDelta: round2(
          ((input.additionalMonthlyIncome ?? 0) - Math.max(0, input.additionalMonthlyExpense ?? 0)) * 12
        ),
        projectedSavingsRatePercent: null,
        meetsSavingsGoal: null,
      },
      notes: [
        'No historical transactions found; simulation reflects only user-entered hypothetical values.',
      ],
    };
  }

  const trends = computeMonthlyTrends(transactions);
  const monthCount = trends.length;
  const avgIncome = round2(trends.reduce((s, t) => s + t.income, 0) / monthCount);
  const avgExpenses = round2(trends.reduce((s, t) => s + t.expenses, 0) / monthCount);
  const avgSavings = round2(avgIncome - avgExpenses);

  let targetCategorySpend: number | null = null;
  if (input.targetCategory) {
    const catTxs = transactions.filter(
      (t) =>
        t.transactionType === 'DEBIT' &&
        t.categoryName.toLowerCase() === input.targetCategory!.toLowerCase()
    );
    const activeMonths = new Set(catTxs.map((t) => getMonthKey(t.transactionDate))).size || monthCount;
    const totalCat = catTxs.reduce((s, t) => s + t.amount, 0);
    targetCategorySpend = round2(totalCat / Math.max(1, monthCount));
    if (totalCat === 0) {
      const allCats = computeSpendingByCategory(transactions);
      const match = allCats.find((c) => c.category.toLowerCase() === input.targetCategory!.toLowerCase());
      targetCategorySpend = match ? round2(match.total / monthCount) : 0;
    }
    void activeMonths;
  }

  // Apply hypothetical changes deterministically
  const globalExpFactor = 1 + (input.expenseAdjustmentPercent ?? 0) / 100;
  let simulatedExpenses = avgExpenses * globalExpFactor;

  if (
    input.targetCategory &&
    targetCategorySpend !== null &&
    input.categoryAdjustmentPercent !== undefined &&
    input.categoryAdjustmentPercent !== 0
  ) {
    const categoryDelta = targetCategorySpend * (input.categoryAdjustmentPercent / 100);
    simulatedExpenses += categoryDelta;
  }

  simulatedExpenses += input.additionalMonthlyExpense ?? 0;
  simulatedExpenses = round2(Math.max(0, simulatedExpenses));

  const simulatedIncome = round2(Math.max(0, avgIncome + (input.additionalMonthlyIncome ?? 0)));
  const simulatedSavings = round2(simulatedIncome - simulatedExpenses);
  const monthlySavingsDelta = round2(simulatedSavings - avgSavings);
  const annualSavingsDelta = round2(monthlySavingsDelta * 12);

  const baselineSavingsRate =
    avgIncome > 0 ? round2(((avgIncome - avgExpenses) / avgIncome) * 100) : null;
  const projectedSavingsRate =
    simulatedIncome > 0
      ? round2(((simulatedIncome - simulatedExpenses) / simulatedIncome) * 100)
      : null;

  const meetsSavingsGoal =
    input.savingsContributionGoal !== undefined && input.savingsContributionGoal > 0
      ? simulatedSavings >= input.savingsContributionGoal
      : null;

  const notes: string[] = [
    `Baseline calculated as the monthly average across ${monthCount} observed month(s) (${trends[0].month} to ${trends[trends.length - 1].month}).`,
    'Hypothetical scenario adjustments are deterministic calculations and are not predictive guarantees.',
  ];

  if (input.targetCategory && targetCategorySpend === 0) {
    notes.push(`No historical expenses were recorded under "${input.targetCategory}", so category adjustment impact is 0.`);
  }

  return {
    dataBasis: 'historical_monthly_average',
    baselineMonthLabel:
      monthCount === 1
        ? trends[0].month
        : `${trends[0].month} – ${trends[trends.length - 1].month} avg`,
    historicalBaseline: {
      monthlyIncome: avgIncome,
      monthlyExpenses: avgExpenses,
      monthlySavings: avgSavings,
      savingsRatePercent: baselineSavingsRate,
      targetCategorySpend,
    },
    hypotheticalAdjustments: input,
    simulatedOutcome: {
      projectedMonthlyIncome: simulatedIncome,
      projectedMonthlyExpenses: simulatedExpenses,
      projectedMonthlySavings: simulatedSavings,
      monthlySavingsDelta,
      annualSavingsDelta,
      projectedSavingsRatePercent: projectedSavingsRate,
      meetsSavingsGoal,
    },
    notes,
  };
}
