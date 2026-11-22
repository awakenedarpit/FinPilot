import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { CategoryRecord, CsvPreviewResult, TransactionRecord, TransactionType } from '../core/types.ts';
import { generateDemoCsvString } from '../core/demoData.ts';
import { filterTransactionsByQuery } from '../core/transactionFilters.ts';
import { api } from '../lib/api.ts';
import { formatCurrency } from '../lib/format.ts';
import { DateRangePicker } from './DateRangePicker.tsx';

interface TransactionsViewProps {
  currency: string;
  categories: CategoryRecord[];
  onDataChanged: () => Promise<void>;
  initialOpenImport?: boolean;
}

export function TransactionsView({
  currency,
  categories,
  onDataChanged,
  initialOpenImport = false,
}: TransactionsViewProps) {
  const [items, setItems] = useState<TransactionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'ALL'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Manual Entry Modal
  const [manualOpen, setManualOpen] = useState(false);
  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10));
  const [mDesc, setMDesc] = useState('');
  const [mMerchant, setMMerchant] = useState('');
  const [mAmount, setMAmount] = useState('');
  const [mType, setMType] = useState<TransactionType>('DEBIT');
  const [mCategory, setMCategory] = useState('');
  const [mSubmitting, setMSubmitting] = useState(false);

  // CSV Import Panel
  const [importOpen, setImportOpen] = useState(initialOpenImport);
  const [csvFilename, setCsvFilename] = useState('statement.csv');
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [exporting, setExporting] = useState(false);

  const didMountSearchRef = useRef(false);

  const fetchTransactions = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await api.listTransactions({
        search: search || undefined,
        category: categoryFilter,
        type: typeFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        pageSize: 100,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void fetchTransactions(false);
  }, [categoryFilter, typeFilter, startDate, endDate]);

  useEffect(() => {
    if (!didMountSearchRef.current) {
      didMountSearchRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      void fetchTransactions(true);
    }, 220);
    return () => clearTimeout(timer);
  }, [search]);

  const visibleItems = useMemo(
    () => filterTransactionsByQuery(items, search),
    [items, search]
  );

  const hasActiveFilters =
    Boolean(search.trim()) ||
    categoryFilter !== 'ALL' ||
    typeFilter !== 'ALL' ||
    Boolean(startDate) ||
    Boolean(endDate);

  const handleClearAllFilters = () => {
    setSearch('');
    setCategoryFilter('ALL');
    setTypeFilter('ALL');
    setStartDate('');
    setEndDate('');
  };

  const handleCategoryChange = async (txId: string, newCat: string) => {
    try {
      const updated = await api.updateTransaction(txId, { categoryName: newCat });
      setItems((prev) => prev.map((t) => (t.id === txId ? updated : t)));
      setStatusMessage(`Updated category to "${newCat}".`);
      await onDataChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (tx: TransactionRecord) => {
    try {
      await api.deleteTransaction(tx.id);
      setItems((prev) => prev.filter((t) => t.id !== tx.id));
      setTotal((t) => Math.max(0, t - 1));
      setStatusMessage(`Deleted "${tx.merchant || tx.description}".`);
      await onDataChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountNum = Number(mAmount);
    if (!mDesc.trim() || !Number.isFinite(amountNum) || amountNum <= 0) {
      setError('Please enter a valid description and positive amount.');
      return;
    }
    setMSubmitting(true);
    try {
      await api.createTransaction({
        description: mDesc.trim(),
        merchant: mMerchant.trim() || null,
        amount: amountNum,
        transactionType: mType,
        transactionDate: mDate,
        categoryName: mCategory || undefined,
      });
      setMDesc('');
      setMMerchant('');
      setMAmount('');
      setMCategory('');
      setManualOpen(false);
      setStatusMessage('Manual transaction saved and classified.');
      await fetchTransactions();
      await onDataChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only .csv files are supported.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('CSV file exceeds the 2 MB maximum limit.');
      return;
    }
    setCsvFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ''));
      setPreview(null);
      setError(null);
    };
    reader.readAsText(file);
  };

  const handlePreviewCsv = async (overrideText?: string, overrideName?: string) => {
    const textToParse = overrideText ?? csvText;
    const nameToUse = overrideName ?? csvFilename;
    if (!textToParse.trim()) {
      setError('Select a CSV file or paste CSV rows before previewing.');
      return;
    }
    setPreviewLoading(true);
    setError(null);
    try {
      const res = await api.previewCsvImport(nameToUse, textToParse);
      setPreview(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview?.batchId) return;
    setConfirmingImport(true);
    setError(null);
    try {
      const summary = await api.confirmCsvImport(preview.batchId);
      setStatusMessage(
        `Imported ${summary.importedRows} transaction(s) from ${summary.filename} (${summary.duplicateRows} duplicate(s), ${summary.invalidRows} invalid skipped).`
      );
      setPreview(null);
      setCsvText('');
      setImportOpen(false);
      await fetchTransactions();
      await onDataChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConfirmingImport(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const { csvText: exportedCsv, filename, rowCount } = await api.exportTransactionsCsv({
        search: search || undefined,
        category: categoryFilter,
        type: typeFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      const blob = new Blob([exportedCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatusMessage(`Exported ${rowCount} transaction(s) to ${filename}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const categoryNames = Array.from(new Set(categories.map((c) => c.name)));

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <header className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
              Transaction Ledger
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono-num">
              {search.trim() ? `${visibleItems.length} matching` : `${total} recorded`} entries ·
              Inline category correction &amp; CSV ingestion
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setImportOpen((v) => !v);
                setManualOpen(false);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[#4169E1] hover:bg-[#3358CC] rounded-lg whitespace-nowrap cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import CSV</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setManualOpen((v) => !v);
                setImportOpen(false);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#101B32] dark:text-white border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Manual Entry</span>
            </button>

            <button
              type="button"
              onClick={() => void handleExportCsv()}
              disabled={loading || exporting || visibleItems.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#101B32] dark:text-white border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>

            <a
              href="/api/v1/demo/sample-csv"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Sample CSV</span>
            </a>
          </div>
        </div>

        {/* Real-time Header Filter Input */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <label htmlFor="tx-header-search" className="sr-only">
              Filter transactions by merchant name or note
            </label>
            <Search
              aria-hidden="true"
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              id="tx-header-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter transactions in real time by merchant name or note (e.g. Swiggy, Rent, Salary)..."
              className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F6F8FC] dark:bg-[#0F172A] text-[#101B32] dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#4169E1]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search filter"
                className="p-1 text-slate-400 hover:text-[#101B32] dark:hover:text-white absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {statusMessage && (
        <div
          role="status"
          className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            aria-label="Dismiss status message"
            className="p-1 hover:opacity-75 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error message"
            className="p-1 hover:opacity-75 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* CSV Import Panel */}
      {importOpen && (
        <section
          aria-label="CSV Statement Import"
          className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] space-y-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#4169E1]" />
              <h3 className="text-sm font-semibold text-[#101B32] dark:text-white">
                CSV Statement Preview &amp; Validation
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              aria-label="Close CSV import panel"
              className="p-1.5 text-slate-500 hover:text-[#101B32] dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <label
                htmlFor="csv-file-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Upload Bank Statement (.csv, max 2 MB)
              </label>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-slate-200 dark:file:border-slate-700 file:bg-slate-50 dark:file:bg-slate-800 file:text-xs file:font-semibold file:text-[#101B32] dark:file:text-white"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handlePreviewCsv()}
                  disabled={previewLoading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#101B32] dark:bg-[#4169E1] rounded-lg disabled:opacity-60 cursor-pointer"
                >
                  {previewLoading ? 'Validating...' : 'Preview & Validate CSV'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sample = generateDemoCsvString();
                    setCsvFilename('demo-transactions.csv');
                    setCsvText(sample);
                    void handlePreviewCsv(sample, 'demo-transactions.csv');
                  }}
                  className="px-3 py-2 text-xs font-medium text-[#4169E1] dark:text-[#7D9BFF] border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Load &amp; Preview Sample Indian CSV
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="csv-paste-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Or Paste CSV Content Directly
              </label>
              <textarea
                id="csv-paste-input"
                rows={4}
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  setPreview(null);
                }}
                placeholder="Date,Description,Merchant,Amount,Type&#10;2026-11-12,SWIGGY LUNCH ORDER,Swiggy,420,DEBIT"
                className="w-full p-2.5 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
              />
            </div>
          </div>

          {preview && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-[#F6F8FC] dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Total Rows</span>
                  <p className="text-base font-bold font-mono-num mt-0.5">{preview.totalRows}</p>
                </div>
                <div className="p-3 rounded-lg bg-[#F6F8FC] dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Valid Rows</span>
                  <p className="text-base font-bold font-mono-num text-[#16A34A] dark:text-[#35B88A] mt-0.5">
                    {preview.validRows}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-[#F6F8FC] dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Duplicates</span>
                  <p className="text-base font-bold font-mono-num text-amber-600 mt-0.5">
                    {preview.duplicateRows}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-[#F6F8FC] dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Invalid Rows</span>
                  <p className="text-base font-bold font-mono-num text-red-600 mt-0.5">
                    {preview.invalidRows}
                  </p>
                </div>
              </div>

              {preview.invalidRowDetails.length > 0 && (
                <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-xs">
                  <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
                    Invalid rows flagged (will not be silently imported):
                  </p>
                  <ul className="space-y-1 text-amber-700 dark:text-amber-300">
                    {preview.invalidRowDetails.slice(0, 5).map((inv) => (
                      <li key={inv.rowNumber}>
                        Row {inv.rowNumber}: {inv.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto max-h-64 border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F6F8FC] dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Description</th>
                      <th className="p-2.5">Category · Method</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {preview.rows.slice(0, 15).map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="p-2.5 font-mono-num whitespace-nowrap">{row.transactionDate}</td>
                        <td className="p-2.5 max-w-[240px] truncate">{row.description}</td>
                        <td className="p-2.5 whitespace-nowrap">
                          {row.category} · {(row.confidence * 100).toFixed(0)}% ({row.method})
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          {row.isDuplicate ? (
                            <span className="text-amber-600 font-medium">Duplicate</span>
                          ) : (
                            <span className="text-[#16A34A] dark:text-[#35B88A] font-medium">Ready</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-mono-num whitespace-nowrap">
                          {row.transactionType === 'CREDIT' ? '+' : '-'}
                          {formatCurrency(row.amount, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Clear Preview
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={confirmingImport || preview.validRows === 0}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#35B88A] hover:bg-[#2B9D75] rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {confirmingImport ? 'Importing...' : `Confirm Import (${preview.validRows - preview.duplicateRows} new)`}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Manual Transaction Form */}
      {manualOpen && (
        <form
          onSubmit={handleCreateManual}
          className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#101B32] dark:text-white">
              Add Manual Transaction
            </h3>
            <button
              type="button"
              onClick={() => setManualOpen(false)}
              aria-label="Close manual entry form"
              className="p-1 text-slate-500 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label htmlFor="m-date" className="block text-xs font-medium mb-1">
                Date
              </label>
              <input
                id="m-date"
                type="date"
                required
                value={mDate}
                onChange={(e) => setMDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
              />
            </div>
            <div className="lg:col-span-2">
              <label htmlFor="m-desc" className="block text-xs font-medium mb-1">
                Description
              </label>
              <input
                id="m-desc"
                type="text"
                required
                value={mDesc}
                onChange={(e) => setMDesc(e.target.value)}
                placeholder="e.g. Swiggy Dinner or Freelance Payout"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
              />
            </div>
            <div>
              <label htmlFor="m-amount" className="block text-xs font-medium mb-1">
                Amount ({currency})
              </label>
              <input
                id="m-amount"
                type="number"
                step="0.01"
                required
                value={mAmount}
                onChange={(e) => setMAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
              />
            </div>
            <div>
              <label htmlFor="m-type" className="block text-xs font-medium mb-1">
                Type
              </label>
              <select
                id="m-type"
                value={mType}
                onChange={(e) => setMType(e.target.value as TransactionType)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
              >
                <option value="DEBIT">Expense (Debit)</option>
                <option value="CREDIT">Income (Credit)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label htmlFor="m-merchant" className="block text-xs font-medium mb-1">
                Merchant (Optional)
              </label>
              <input
                id="m-merchant"
                type="text"
                value={mMerchant}
                onChange={(e) => setMMerchant(e.target.value)}
                placeholder="Auto-normalized if blank"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
              />
            </div>
            <div>
              <label htmlFor="m-cat" className="block text-xs font-medium mb-1">
                Category (Optional)
              </label>
              <select
                id="m-cat"
                value={mCategory}
                onChange={(e) => setMCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
              >
                <option value="">Auto-classify automatically</option>
                {categoryNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={mSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#101B32] dark:bg-[#4169E1] rounded-lg disabled:opacity-60 cursor-pointer"
              >
                {mSubmitting ? 'Saving...' : 'Save Transaction'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filter Controls & DateRangePicker */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
        <div className="lg:col-span-3">
          <label htmlFor="tx-cat-filter" className="block text-xs font-medium text-slate-500 mb-1">
            Category
          </label>
          <select
            id="tx-cat-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
          >
            <option value="ALL">All Categories</option>
            {categoryNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-3">
          <label htmlFor="tx-type-filter" className="block text-xs font-medium text-slate-500 mb-1">
            Type
          </label>
          <select
            id="tx-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TransactionType | 'ALL')}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
          >
            <option value="ALL">All Types</option>
            <option value="DEBIT">Debit (Expenses)</option>
            <option value="CREDIT">Credit (Income)</option>
          </select>
        </div>

        <div className="lg:col-span-4">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={(nextStart, nextEnd) => {
              setStartDate(nextStart);
              setEndDate(nextEnd);
            }}
          />
        </div>

        <div className="lg:col-span-2 flex justify-end">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="w-full px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading transactions...</div>
        ) : visibleItems.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-[#101B32] dark:text-white">
              No transactions match your current filters
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Clear filters, add a manual entry, or import a bank CSV statement.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F6F8FC] dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Description &amp; Metadata</th>
                  <th className="py-3 px-4 font-medium">Category</th>
                  <th className="py-3 px-4 text-right font-medium">Amount</th>
                  <th className="py-3 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {visibleItems.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-4 text-xs font-mono-num text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {tx.transactionDate}
                    </td>
                    <td className="py-3 px-4 min-w-[220px]">
                      <p className="font-medium text-[#101B32] dark:text-white">
                        {tx.merchant || tx.description}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md mt-0.5">
                        {tx.description} · {tx.source}
                        {tx.classificationConfidence !== null
                          ? ` · ${(tx.classificationConfidence * 100).toFixed(0)}% ${tx.classificationMethod || ''}`
                          : ''}
                      </p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <select
                        aria-label={`Category for ${tx.merchant || tx.description} on ${tx.transactionDate}`}
                        value={tx.categoryName}
                        onChange={(e) => void handleCategoryChange(tx.id, e.target.value)}
                        className="px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
                      >
                        {categoryNames.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono-num font-semibold whitespace-nowrap ${
                        tx.transactionType === 'CREDIT'
                          ? 'text-[#16A34A] dark:text-[#35B88A]'
                          : 'text-[#101B32] dark:text-white'
                      }`}
                    >
                      {tx.transactionType === 'CREDIT' ? '+' : '-'}
                      {formatCurrency(tx.amount, currency)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void handleDelete(tx)}
                        aria-label={`Delete '${tx.merchant || tx.description}' on ${tx.transactionDate}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
