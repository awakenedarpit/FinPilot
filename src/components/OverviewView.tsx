import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Plus,
  Target,
  TrendingUp,
  Upload,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AnomalyAlert,
  ForecastOutput,
  MonthlyTrendPoint,
  OverviewMetrics,
  ReminderSummary,
  TransactionRecord,
} from '../core/types.ts';
import { api, type FinancialGoalItem } from '../lib/api.ts';
import { formatCompactCurrency, formatCurrency, formatMonthLabel } from '../lib/format.ts';
import type { NavTab } from './AppShell.tsx';

interface OverviewViewProps {
  overview: OverviewMetrics | null;
  trends: MonthlyTrendPoint[];
  recentTransactions: TransactionRecord[];
  anomalies: AnomalyAlert[];
  forecast: ForecastOutput | null;
  goals: FinancialGoalItem[];
  reminderSummary?: ReminderSummary | null;
  loading: boolean;
  onNavigate: (tab: NavTab) => void;
  onRefresh: () => Promise<void>;
}

export function OverviewView({
  overview,
  trends,
  recentTransactions,
  anomalies,
  forecast,
  goals,
  reminderSummary,
  loading,
  onNavigate,
  onRefresh,
}: OverviewViewProps) {
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [addingGoal, setAddingGoal] = useState(false);
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);

  if (loading && !overview) {
    return (
      <div className="space-y-6" aria-label="Loading overview">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] animate-pulse" />
      </div>
    );
  }

  if (!overview || overview.transactionCount === 0) {
    return (
      <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] text-center max-w-xl mx-auto my-8">
        <h2 className="text-xl font-bold text-[#101B32] dark:text-white">
          No financial transactions yet
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
          Import a bank CSV statement, add a manual entry, or load the synthetic Indian INR demo
          dataset to unlock spending analytics, forecasting, and AI Copilot insights.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('transactions')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#4169E1] hover:bg-[#3358CC] rounded-lg cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Import CSV or Add Transaction</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              await api.loadDemoDataset();
              await onRefresh();
            }}
            className="px-4 py-2.5 text-sm font-semibold text-[#101B32] dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            Load Demo Dataset
          </button>
        </div>
      </div>
    );
  }

  const currency = overview.currency;
  const chartTrends = trends.map((t) => ({
    ...t,
    label: formatMonthLabel(t.month),
  }));

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoalError(null);
    const numTarget = Number(goalTarget);
    if (!goalTitle.trim() || !Number.isFinite(numTarget) || numTarget <= 0) {
      setGoalError('Enter a valid goal title and positive target amount.');
      return;
    }
    setAddingGoal(true);
    try {
      await api.createGoal({
        title: goalTitle.trim(),
        targetAmount: numTarget,
        currentAmount: Math.max(0, overview.currentMonthSavings),
      });
      setGoalTitle('');
      setGoalTarget('');
      setGoalFormOpen(false);
      await onRefresh();
    } catch (err) {
      setGoalError((err as Error).message);
    } finally {
      setAddingGoal(false);
    }
  };

  return (
    <div className="space-y-6">
      {reminderSummary && reminderSummary.activeAlertCount > 0 && (
        <section
          aria-label="Urgent payment and EMI deadlines"
          className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3 min-w-0">
            <CalendarClock className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#101B32] dark:text-white">
                {reminderSummary.overdueCount > 0
                  ? `${reminderSummary.overdueCount} overdue payment${reminderSummary.overdueCount === 1 ? '' : 's'} & ${reminderSummary.dueTodayCount + reminderSummary.dueSoonCount} due soon`
                  : `${reminderSummary.activeAlertCount} upcoming payment deadline${reminderSummary.activeAlertCount === 1 ? '' : 's'} require attention`}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                {reminderSummary.urgentReminders
                  .slice(0, 2)
                  .map((r) => `${r.title} (${formatCurrency(r.amount, currency)} · ${r.dueDate})`)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('reminders')}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#101B32] dark:bg-[#4169E1] text-white hover:opacity-95 cursor-pointer"
          >
            <span>Open Reminders</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </section>
      )}

      {/* 4-Column KPI Strip */}
      <section aria-label="Financial summary KPIs" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Recorded Income
          </p>
          <p className="mt-2 text-2xl font-bold font-mono-num text-[#101B32] dark:text-white">
            {formatCurrency(overview.totalIncome, currency)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            {overview.latestMonth ? `${formatMonthLabel(overview.latestMonth)}: ` : ''}
            {formatCurrency(overview.currentMonthIncome, currency)}
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Recorded Expenses
          </p>
          <p className="mt-2 text-2xl font-bold font-mono-num text-[#101B32] dark:text-white">
            {formatCurrency(overview.totalExpenses, currency)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            {overview.monthOverMonthExpenseChangePercent !== null
              ? `MoM ${overview.monthOverMonthExpenseChangePercent >= 0 ? '+' : ''}${overview.monthOverMonthExpenseChangePercent}%`
              : `${overview.transactionCount} total entries`}
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Net Cash Flow
          </p>
          <p
            className={`mt-2 text-2xl font-bold font-mono-num ${
              overview.netCashFlow >= 0
                ? 'text-[#16A34A] dark:text-[#35B88A]'
                : 'text-[#DC2626] dark:text-red-400'
            }`}
          >
            {overview.netCashFlow >= 0 ? '+' : ''}
            {formatCurrency(overview.netCashFlow, currency)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            {overview.hasOpeningBalance && overview.recordedBalance !== null
              ? `Recorded Balance: ${formatCurrency(overview.recordedBalance, currency)}`
              : 'Opening balance not set'}
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Latest Month Savings
          </p>
          <p className="mt-2 text-2xl font-bold font-mono-num text-[#101B32] dark:text-white">
            {formatCurrency(overview.currentMonthSavings, currency)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            {overview.savingsRatePercent !== null
              ? `Savings Rate: ${overview.savingsRatePercent}%`
              : 'Savings rate unavailable (zero income)'}
          </p>
        </div>
      </section>

      {/* Primary Charts Row */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
                Income vs. Expenses Trend
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Monthly cash-flow totals from stored ledger entries
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-medium text-[#4169E1] dark:text-[#7D9BFF] hover:underline whitespace-nowrap cursor-pointer"
            >
              View Analytics
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartTrends} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.4} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#64748B" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#64748B"
                  tickFormatter={(v) => formatCompactCurrency(Number(v), currency)}
                />
                <Tooltip
                  formatter={(value: unknown) => formatCurrency(Number(value), currency)}
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
                  dataKey="income"
                  name="Income"
                  stroke="#35B88A"
                  fill="#35B88A"
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  stroke="#4169E1"
                  fill="#4169E1"
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
                Top Expense Categories
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cumulative debit distribution
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('copilot')}
              className="text-xs font-medium text-[#4169E1] dark:text-[#7D9BFF] hover:underline whitespace-nowrap cursor-pointer"
            >
              Ask Copilot
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={overview.spendingByCategory.slice(0, 6)}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.4} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  stroke="#64748B"
                  tickFormatter={(v) => formatCompactCurrency(Number(v), currency)}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={90}
                  tick={{ fontSize: 12 }}
                  stroke="#64748B"
                />
                <Tooltip
                  formatter={(value: unknown) => formatCurrency(Number(value), currency)}
                  labelStyle={{ color: '#101B32', fontWeight: 600 }}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#101B32',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="total" name="Spend" fill="#4169E1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Bottom Grid: Recent Transactions + Insights & Forecast Preview */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
              Recent Transactions
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#4169E1] dark:text-[#7D9BFF] hover:underline whitespace-nowrap cursor-pointer"
            >
              <span>Manage All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Merchant / Details</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {recentTransactions.slice(0, 6).map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 pr-3 text-xs font-mono-num text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {tx.transactionDate}
                    </td>
                    <td className="py-2.5 pr-3 min-w-[160px]">
                      <p className="font-medium text-[#101B32] dark:text-white truncate max-w-[230px]">
                        {tx.merchant || tx.description}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {tx.categoryName}
                    </td>
                    <td
                      className={`py-2.5 text-right font-mono-num font-medium whitespace-nowrap ${
                        tx.transactionType === 'CREDIT'
                          ? 'text-[#16A34A] dark:text-[#35B88A]'
                          : 'text-[#101B32] dark:text-white'
                      }`}
                    >
                      {tx.transactionType === 'CREDIT' ? '+' : '-'}
                      {formatCurrency(tx.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          {/* Anomaly & Insights Card */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#D97706]" />
                <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
                  Financial Insights &amp; Alerts
                </h2>
              </div>
              <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                {anomalies.length} item(s)
              </span>
            </div>

            {anomalies.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No unusual spending spikes or duplicate charges detected in your current dataset.
              </p>
            ) : (
              <div className="space-y-3">
                {anomalies.slice(0, 3).map((alert) => (
                  <div
                    key={alert.id}
                    className="pb-3 last:pb-0 border-b last:border-b-0 border-slate-100 dark:border-slate-800"
                  >
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      {alert.label} · {alert.severity}
                    </p>
                    <p className="text-sm font-medium text-[#101B32] dark:text-white mt-0.5">
                      {alert.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {alert.historicalBaseline}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Forecast Preview Card */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
            <div className="flex items-center justify-between gap-4 mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#8275E5]" />
                <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
                  Cash-Flow Forecast Preview
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('forecasts')}
                className="text-xs font-medium text-[#4169E1] dark:text-[#7D9BFF] hover:underline cursor-pointer"
              >
                Open Forecasts
              </button>
            </div>
            {forecast?.status === 'ready' && forecast.points[0] ? (
              <div className="mt-2 space-y-1.5 text-sm">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Next projected month ({formatMonthLabel(forecast.points[0].month)})
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Projected Expenses</span>
                  <span className="font-mono-num font-semibold text-[#101B32] dark:text-white">
                    {formatCurrency(forecast.points[0].projectedExpenses, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Projected Net Cash Flow</span>
                  <span className="font-mono-num font-semibold text-[#16A34A] dark:text-[#35B88A]">
                    {formatCurrency(forecast.points[0].projectedNetCashFlow, currency)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {forecast?.reason || 'Upload at least 2 months of history to generate forecasts.'}
              </p>
            )}
          </div>

          {/* Goals Quick Card */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-[#35B88A]" />
                <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
                  Savings Goals
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setGoalFormOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#4169E1] dark:text-[#7D9BFF] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Goal</span>
              </button>
            </div>

            {goalFormOpen && (
              <form onSubmit={handleCreateGoal} className="mb-3 space-y-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <input
                  type="text"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="Goal title (e.g. Emergency Fund)"
                  aria-label="Goal title"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    placeholder="Target amount"
                    aria-label="Target amount"
                    className="flex-1 px-3 py-1.5 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
                  />
                  <button
                    type="submit"
                    disabled={addingGoal}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#101B32] dark:bg-[#4169E1] rounded-lg cursor-pointer"
                  >
                    Save
                  </button>
                </div>
                {goalError && <p className="text-xs text-red-600">{goalError}</p>}
              </form>
            )}

            {goals.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No savings goals added yet. Create a target to benchmark monthly savings.
              </p>
            ) : (
              <div className="space-y-2.5">
                {goals.slice(0, 3).map((g) => {
                  const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
                  return (
                    <div key={g.id} className="text-xs">
                      <div className="flex justify-between font-medium text-[#101B32] dark:text-white">
                        <span>{g.title}</span>
                        <span className="font-mono-num">
                          {formatCurrency(g.currentAmount, currency)} / {formatCurrency(g.targetAmount, currency)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full bg-[#35B88A]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
