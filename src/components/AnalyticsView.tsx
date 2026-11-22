import { useState } from 'react';
import { FileDown } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { generateMonthlySpendingPdf } from '../core/pdfReport.ts';
import type {
  CategorySpendSummary,
  MerchantSummary,
  MonthlyTrendPoint,
  RecurringCandidate,
} from '../core/types.ts';
import { formatCompactCurrency, formatCurrency, formatMonthLabel } from '../lib/format.ts';

interface AnalyticsViewProps {
  currency: string;
  accountLabel?: string;
  categories: CategorySpendSummary[];
  merchants: MerchantSummary[];
  trends: MonthlyTrendPoint[];
  recurring: RecurringCandidate[];
  loading: boolean;
}

export function AnalyticsView({
  currency,
  accountLabel = 'Personal Ledger',
  categories,
  merchants,
  trends,
  recurring,
  loading,
}: AnalyticsViewProps) {
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  if (loading && categories.length === 0 && trends.length === 0) {
    return (
      <div className="space-y-6">
        <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] animate-pulse" />
        <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] animate-pulse" />
      </div>
    );
  }

  if (trends.length === 0) {
    return (
      <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] text-center">
        <h2 className="text-lg font-semibold text-[#101B32] dark:text-white">
          No analytics available yet
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Import a CSV statement or load the demo dataset to view spending breakdowns, merchant
          concentration, and recurring commitments.
        </p>
      </div>
    );
  }

  const trendChartData = trends.map((t) => ({
    ...t,
    label: formatMonthLabel(t.month),
  }));

  const handleDownloadPdf = () => {
    setPdfDownloading(true);
    setPdfNotice(null);
    try {
      const nowIso = new Date().toISOString();
      const pdfBytes = generateMonthlySpendingPdf({
        currency,
        accountLabel,
        generatedAtIso: nowIso,
        trends,
        categories,
        merchants,
        recurring,
      });

      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const filename = `finpilot-spending-report-${nowIso.slice(0, 10)}.pdf`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setPdfNotice(
        `Downloaded ${filename} (${trends.length} month${trends.length === 1 ? '' : 's'}, ${categories.length} categories).`
      );
    } finally {
      setPdfDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Report Toolbar */}
      <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
            Monthly Spending Trends Summary
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {trends.length} observed month{trends.length === 1 ? '' : 's'} · {categories.length} spending categories · Deterministic PDF statement report
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={pdfDownloading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#101B32] dark:bg-[#4169E1] text-white hover:opacity-95 disabled:opacity-60 transition-opacity whitespace-nowrap cursor-pointer"
        >
          <FileDown className="w-4 h-4 shrink-0" />
          <span>{pdfDownloading ? 'Generating PDF…' : 'Download PDF Report'}</span>
        </button>
      </section>

      {pdfNotice && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs font-medium text-emerald-800 dark:text-emerald-200"
        >
          {pdfNotice}
        </div>
      )}

      {/* Monthly Comparison Chart */}
      <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
            Monthly Income vs. Expenses Comparison
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Side-by-side deterministic monthly aggregates across all observed periods
          </p>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendChartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
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
              <Bar dataKey="income" name="Income" fill="#35B88A" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#4169E1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown Table */}
        <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <h2 className="text-base font-semibold text-[#101B32] dark:text-white mb-1">
            Category Spending Breakdown
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Share of total debit expenditure by classified category
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 text-right font-medium">Txns</th>
                  <th className="py-2 pr-3 text-right font-medium">Share</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {categories.map((cat) => (
                  <tr key={cat.category}>
                    <td className="py-2.5 pr-3 font-medium text-[#101B32] dark:text-white">
                      {cat.category}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono-num text-xs text-slate-500">
                      {cat.count}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono-num text-xs text-slate-600 dark:text-slate-300">
                      {cat.sharePercent.toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right font-mono-num font-semibold text-[#101B32] dark:text-white">
                      {formatCurrency(cat.total, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Merchant Concentration */}
        <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <h2 className="text-base font-semibold text-[#101B32] dark:text-white mb-1">
            Top Merchants by Spend
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Normalized merchant totals and average ticket sizes
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Merchant</th>
                  <th className="py-2 pr-3 text-right font-medium">Count</th>
                  <th className="py-2 pr-3 text-right font-medium">Avg</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {merchants.slice(0, 10).map((m) => (
                  <tr key={m.merchant}>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-[#101B32] dark:text-white">{m.merchant}</p>
                      <p className="text-xs text-slate-500">{m.primaryCategory}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono-num text-xs text-slate-500">
                      {m.count}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono-num text-xs text-slate-600 dark:text-slate-300">
                      {formatCurrency(m.avgAmount, currency)}
                    </td>
                    <td className="py-2.5 text-right font-mono-num font-semibold text-[#101B32] dark:text-white">
                      {formatCurrency(m.total, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Recurring Expense Candidates */}
      <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
        <h2 className="text-base font-semibold text-[#101B32] dark:text-white mb-1">
          Detected Recurring Expenses &amp; Commitments
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Identified automatically across multi-month intervals (22–40 day cadence, low amount variance)
        </p>

        {recurring.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No recurring monthly commitments detected yet. At least 2 months of matching debits are
            required.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Merchant</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 text-right font-medium">Cadence</th>
                  <th className="py-2 pr-3 text-right font-medium">Next Est. Date</th>
                  <th className="py-2 text-right font-medium">Avg Monthly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {recurring.map((r) => (
                  <tr key={r.merchant}>
                    <td className="py-2.5 pr-3 font-medium text-[#101B32] dark:text-white">
                      {r.merchant}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-slate-600 dark:text-slate-300">
                      {r.category} · {r.occurrences}x
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono-num text-xs text-slate-500">
                      ~{r.cadenceDays} days
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono-num text-xs text-slate-500">
                      {r.nextEstimatedDate}
                    </td>
                    <td className="py-2.5 text-right font-mono-num font-semibold text-[#101B32] dark:text-white">
                      {formatCurrency(r.averageAmount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
