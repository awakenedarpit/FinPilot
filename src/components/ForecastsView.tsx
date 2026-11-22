import { useEffect, useState } from 'react';
import { AlertTriangle, Calculator, RefreshCw } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AnomalyAlert,
  ForecastOutput,
  MonthlyTrendPoint,
  SimulationOutput,
} from '../core/types.ts';
import { api } from '../lib/api.ts';
import { formatCompactCurrency, formatCurrency, formatMonthLabel } from '../lib/format.ts';

interface ForecastsViewProps {
  currency: string;
  trends: MonthlyTrendPoint[];
  forecast: ForecastOutput | null;
  anomalies: AnomalyAlert[];
  onRefresh: () => Promise<void>;
}

export function ForecastsView({
  currency,
  trends,
  forecast,
  anomalies,
  onRefresh,
}: ForecastsViewProps) {
  const [regenerating, setRegenerating] = useState(false);

  // Scenario Simulation Controls
  const [targetCategory, setTargetCategory] = useState('Shopping');
  const [categoryAdjustmentPercent, setCategoryAdjustmentPercent] = useState(-15);
  const [expenseAdjustmentPercent, setExpenseAdjustmentPercent] = useState(0);
  const [additionalMonthlyExpense, setAdditionalMonthlyExpense] = useState(0);
  const [additionalMonthlyIncome, setAdditionalMonthlyIncome] = useState(0);
  const [simResult, setSimResult] = useState<SimulationOutput | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  const runSimulationNow = async () => {
    setSimLoading(true);
    setSimError(null);
    try {
      const res = await api.runSimulation({
        targetCategory,
        categoryAdjustmentPercent,
        expenseAdjustmentPercent,
        additionalMonthlyExpense,
        additionalMonthlyIncome,
      });
      setSimResult(res);
    } catch (err) {
      setSimError((err as Error).message);
    } finally {
      setSimLoading(false);
    }
  };

  useEffect(() => {
    void runSimulationNow();
  }, [
    targetCategory,
    categoryAdjustmentPercent,
    expenseAdjustmentPercent,
    additionalMonthlyExpense,
    additionalMonthlyIncome,
  ]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await api.generateForecasts(3);
      await api.analyzeAnomalies();
      await onRefresh();
    } finally {
      setRegenerating(false);
    }
  };

  // Merge historical and projected series for combined chart
  const chartData = [
    ...trends.map((t) => ({
      label: formatMonthLabel(t.month),
      actualExpenses: t.expenses,
      actualIncome: t.income,
      projectedExpenses: null as number | null,
      projectedIncome: null as number | null,
      upperExpense: null as number | null,
      lowerExpense: null as number | null,
    })),
    ...(forecast?.points ?? []).map((p) => ({
      label: `${formatMonthLabel(p.month)} (Est.)`,
      actualExpenses: null as number | null,
      actualIncome: null as number | null,
      projectedExpenses: p.projectedExpenses,
      projectedIncome: p.projectedIncome,
      upperExpense: p.upperExpenseEstimate,
      lowerExpense: p.lowerExpenseEstimate,
    })),
  ];

  return (
    <div className="space-y-6">
      {/* Cash-Flow Forecast Section */}
      <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
              Cash-Flow Forecast &amp; Uncertainty Range
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono-num">
              {forecast
                ? `Model ${forecast.modelVersion} · Observed ${forecast.observedMonths} month(s)`
                : 'Statistical EWMA + recurring commitments'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#101B32] dark:text-white border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer self-start"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
            <span>{regenerating ? 'Recalculating...' : 'Recalculate Forecast & Anomalies'}</span>
          </button>
        </div>

        {forecast?.status === 'insufficient_data' ? (
          <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-800 dark:text-amber-200">
            <p className="font-semibold">Insufficient historical data for statistical forecast</p>
            <p className="text-xs mt-1">{forecast.reason}</p>
          </div>
        ) : (
          <>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.4} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748B" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="#64748B"
                    tickFormatter={(v) => formatCompactCurrency(Number(v), currency)}
                  />
                  <Tooltip
                    formatter={(value: unknown) =>
                      value === null ? '—' : formatCurrency(Number(value), currency)
                    }
                    labelStyle={{ color: '#101B32', fontWeight: 600 }}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      color: '#101B32',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="upperExpense"
                    name="Upper Expense Est."
                    stroke="none"
                    fill="#8275E5"
                    fillOpacity={0.14}
                  />
                  <Line
                    type="monotone"
                    dataKey="actualExpenses"
                    name="Actual Expenses"
                    stroke="#4169E1"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedExpenses"
                    name="Projected Expenses"
                    stroke="#8275E5"
                    strokeDasharray="5 5"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actualIncome"
                    name="Actual Income"
                    stroke="#35B88A"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedIncome"
                    name="Projected Income"
                    stroke="#35B88A"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {forecast?.points && forecast.points.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Month</th>
                      <th className="py-2 pr-3 text-right">Est. Income</th>
                      <th className="py-2 pr-3 text-right">Est. Expenses</th>
                      <th className="py-2 pr-3 text-right">Expense Range</th>
                      <th className="py-2 pr-3 text-right">Projected Net</th>
                      <th className="py-2 text-right">Projected Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {forecast.points.map((pt) => (
                      <tr key={pt.month}>
                        <td className="py-2.5 pr-3 font-medium text-[#101B32] dark:text-white">
                          {formatMonthLabel(pt.month)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono-num">
                          {formatCurrency(pt.projectedIncome, currency)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono-num">
                          {formatCurrency(pt.projectedExpenses, currency)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono-num text-slate-500">
                          {formatCurrency(pt.lowerExpenseEstimate, currency)} –{' '}
                          {formatCurrency(pt.upperExpenseEstimate, currency)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono-num font-semibold text-[#16A34A] dark:text-[#35B88A]">
                          {formatCurrency(pt.projectedNetCashFlow, currency)}
                        </td>
                        <td className="py-2.5 text-right font-mono-num">
                          {pt.projectedBalance !== null
                            ? formatCurrency(pt.projectedBalance, currency)
                            : 'Opening balance unset'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {forecast?.evaluation && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                Holdout backtest ({forecast.evaluation.holdoutMonth}): Predicted{' '}
                {formatCurrency(forecast.evaluation.predictedExpenses, currency)} vs Actual{' '}
                {formatCurrency(forecast.evaluation.actualExpenses, currency)} · MAPE{' '}
                {forecast.evaluation.mapePercent ?? '—'}%
              </p>
            )}
          </>
        )}
      </section>

      {/* Deterministic Scenario Simulation Studio */}
      <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="w-4 h-4 text-[#4169E1]" />
          <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
            Scenario Simulation Studio
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          Test hypothetical budget changes against your historical monthly baseline. Simulations are
          deterministic calculations, not financial guarantees.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="sim-category" className="block text-xs font-medium mb-1">
                  Target Category
                </label>
                <select
                  id="sim-category"
                  value={targetCategory}
                  onChange={(e) => setTargetCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
                >
                  <option value="Shopping">Shopping</option>
                  <option value="Food">Food</option>
                  <option value="Transport">Transport</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Utilities">Utilities</option>
                </select>
              </div>

              <div>
                <label htmlFor="sim-cat-pct" className="block text-xs font-medium mb-1">
                  Category Change ({categoryAdjustmentPercent}%)
                </label>
                <input
                  id="sim-cat-pct"
                  type="range"
                  min={-50}
                  max={50}
                  step={5}
                  value={categoryAdjustmentPercent}
                  onChange={(e) => setCategoryAdjustmentPercent(Number(e.target.value))}
                  className="w-full accent-[#4169E1]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="sim-overall-pct" className="block text-xs font-medium mb-1">
                Overall Expense Adjustment ({expenseAdjustmentPercent}%)
              </label>
              <input
                id="sim-overall-pct"
                type="range"
                min={-30}
                max={30}
                step={5}
                value={expenseAdjustmentPercent}
                onChange={(e) => setExpenseAdjustmentPercent(Number(e.target.value))}
                className="w-full accent-[#4169E1]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="sim-add-exp" className="block text-xs font-medium mb-1">
                  Additional Monthly Expense ({currency})
                </label>
                <input
                  id="sim-add-exp"
                  type="number"
                  min={0}
                  step={500}
                  value={additionalMonthlyExpense}
                  onChange={(e) => setAdditionalMonthlyExpense(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
                />
              </div>
              <div>
                <label htmlFor="sim-add-inc" className="block text-xs font-medium mb-1">
                  Additional Monthly Income ({currency})
                </label>
                <input
                  id="sim-add-inc"
                  type="number"
                  min={0}
                  step={1000}
                  value={additionalMonthlyIncome}
                  onChange={(e) => setAdditionalMonthlyIncome(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F6F8FC] dark:bg-[#0F172A]">
            {simError && <p className="text-xs text-red-600 mb-2">{simError}</p>}
            {simLoading && !simResult ? (
              <p className="text-xs text-slate-500">Calculating scenario...</p>
            ) : simResult ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Historical Monthly Baseline</span>
                  <span className="font-mono-num">{simResult.baselineMonthLabel ?? 'No history'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Baseline Monthly Savings</span>
                  <span className="font-mono-num font-semibold">
                    {formatCurrency(simResult.historicalBaseline.monthlySavings, currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Simulated Monthly Expenses</span>
                  <span className="font-mono-num font-semibold">
                    {formatCurrency(simResult.simulatedOutcome.projectedMonthlyExpenses, currency)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between">
                  <span className="font-semibold text-[#101B32] dark:text-white">
                    Simulated Monthly Savings
                  </span>
                  <span className="font-mono-num font-bold text-[#4169E1] dark:text-[#7D9BFF]">
                    {formatCurrency(simResult.simulatedOutcome.projectedMonthlySavings, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Monthly / Annual Impact</span>
                  <span
                    className={`font-mono-num font-semibold ${
                      simResult.simulatedOutcome.monthlySavingsDelta >= 0
                        ? 'text-[#16A34A] dark:text-[#35B88A]'
                        : 'text-[#DC2626] dark:text-red-400'
                    }`}
                  >
                    {simResult.simulatedOutcome.monthlySavingsDelta >= 0 ? '+' : ''}
                    {formatCurrency(simResult.simulatedOutcome.monthlySavingsDelta, currency)}/mo ·{' '}
                    {simResult.simulatedOutcome.annualSavingsDelta >= 0 ? '+' : ''}
                    {formatCurrency(simResult.simulatedOutcome.annualSavingsDelta, currency)}/yr
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                  {simResult.notes[0]}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Explainable Anomaly Detection Log */}
      <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-[#D97706]" />
          <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
            Explainable Anomaly Detection Alerts
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Flags outliers using Median Absolute Deviation (MAD), IQR fences, and 48-hour duplicate
          matching
        </p>

        {anomalies.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No unusual activity detected in your current ledger.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {anomalies.map((alert) => (
              <div key={alert.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {alert.label} · Severity: {alert.severity}
                  </span>
                  {alert.evidence.amount !== undefined && (
                    <span className="text-xs font-mono-num font-semibold text-[#101B32] dark:text-white">
                      {formatCurrency(alert.evidence.amount, currency)}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-[#101B32] dark:text-white mt-1">
                  {alert.title}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {alert.description}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
                  Reason: {alert.detectionReason} · Baseline: {alert.historicalBaseline}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
