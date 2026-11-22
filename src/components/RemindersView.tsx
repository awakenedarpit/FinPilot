import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CategoryRecord,
  PaymentReminderRecord,
  ReminderRecurrence,
  ReminderSummary,
  ReminderType,
} from '../core/types.ts';
import { getTodayIsoDate } from '../core/reminders.ts';
import { api } from '../lib/api.ts';
import { formatCurrency } from '../lib/format.ts';

interface RemindersViewProps {
  currency: string;
  categories: CategoryRecord[];
  reminders: PaymentReminderRecord[];
  summary: ReminderSummary | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
}

type FilterMode = 'ALL_PENDING' | 'URGENT' | 'COMPLETED';

const REMINDER_TYPES: Array<{ value: ReminderType; label: string }> = [
  { value: 'EMI', label: 'EMI Installment' },
  { value: 'BILL', label: 'Utility / Rent Bill' },
  { value: 'SUBSCRIPTION', label: 'Subscription' },
  { value: 'EXPENSE', label: 'Planned Expense' },
  { value: 'TAX', label: 'Tax / Compliance' },
];

const RECURRENCE_OPTIONS: Array<{ value: ReminderRecurrence; label: string }> = [
  { value: 'ONCE', label: 'One-time' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'YEARLY', label: 'Yearly' },
];

function formatUrgencyText(item: PaymentReminderRecord): {
  label: string;
  colorClass: string;
} {
  if (item.urgency === 'PAID') {
    return {
      label: 'Paid',
      colorClass: 'text-emerald-700 dark:text-emerald-300',
    };
  }
  if (item.urgency === 'DISMISSED') {
    return {
      label: 'Dismissed',
      colorClass: 'text-slate-500 dark:text-slate-400',
    };
  }
  if (item.urgency === 'OVERDUE') {
    const days = Math.abs(item.daysUntilDue ?? 0);
    return {
      label: `Overdue by ${days} day${days === 1 ? '' : 's'}`,
      colorClass: 'text-red-700 dark:text-red-400 font-semibold',
    };
  }
  if (item.urgency === 'DUE_TODAY') {
    return {
      label: 'Due today',
      colorClass: 'text-amber-700 dark:text-amber-300 font-semibold',
    };
  }
  if (item.urgency === 'DUE_SOON') {
    const days = item.daysUntilDue ?? 0;
    return {
      label: `Due in ${days} day${days === 1 ? '' : 's'}`,
      colorClass: 'text-amber-700 dark:text-amber-300 font-semibold',
    };
  }
  const days = item.daysUntilDue ?? 0;
  return {
    label: `In ${days} day${days === 1 ? '' : 's'}`,
    colorClass: 'text-slate-600 dark:text-slate-300',
  };
}

export function RemindersView({
  currency,
  categories,
  reminders,
  summary,
  loading,
  onRefresh,
}: RemindersViewProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('ALL_PENDING');
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [reminderType, setReminderType] = useState<ReminderType>('EMI');
  const [merchant, setMerchant] = useState('');
  const [categoryName, setCategoryName] = useState('Housing');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(getTodayIsoDate());
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>('MONTHLY');
  const [remindDaysBefore, setRemindDaysBefore] = useState('5');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [importingRecurring, setImportingRecurring] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');

  const filteredReminders = reminders.filter((r) => {
    if (filterMode === 'URGENT') {
      return (
        r.status === 'PENDING' &&
        (r.urgency === 'OVERDUE' || r.urgency === 'DUE_TODAY' || r.urgency === 'DUE_SOON')
      );
    }
    if (filterMode === 'COMPLETED') {
      return r.status === 'PAID' || r.status === 'DISMISSED';
    }
    return r.status === 'PENDING';
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const parsedAmount = Number(amount);
    const parsedLeadDays = Number(remindDaysBefore);
    if (!title.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !dueDate) {
      setError('Enter a reminder title, a valid positive amount, and a due date.');
      return;
    }

    setSubmitting(true);
    try {
      await api.createReminder({
        title: title.trim(),
        reminderType,
        merchant: merchant.trim() || null,
        categoryName,
        amount: parsedAmount,
        dueDate,
        recurrence,
        remindDaysBefore: Number.isFinite(parsedLeadDays)
          ? Math.max(0, Math.min(60, Math.round(parsedLeadDays)))
          : 3,
        notes: notes.trim() || null,
      });
      setTitle('');
      setMerchant('');
      setAmount('');
      setNotes('');
      setFormOpen(false);
      setNotice('Saved payment deadline reminder.');
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkPaid = async (item: PaymentReminderRecord) => {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      const res = await api.markReminderPaid(item.id);
      if (res.advancedToNextCycle) {
        setNotice(
          `Marked "${item.title}" paid. Next ${item.recurrence.toLowerCase()} due date advanced to ${res.reminder.dueDate}.`
        );
      } else {
        setNotice(`Marked "${item.title}" as paid.`);
      }
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDismissToggle = async (item: PaymentReminderRecord) => {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      const nextStatus = item.status === 'DISMISSED' ? 'PENDING' : 'DISMISSED';
      await api.updateReminder(item.id, { status: nextStatus });
      setNotice(
        nextStatus === 'DISMISSED'
          ? `Dismissed "${item.title}".`
          : `Reactivated "${item.title}" to pending.`
      );
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: PaymentReminderRecord) => {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await api.deleteReminder(item.id);
      setNotice(`Deleted "${item.title}".`);
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleImportRecurring = async () => {
    setImportingRecurring(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.importRecurringReminders();
      setNotice(
        res.importedCount > 0
          ? `Imported ${res.importedCount} recurring payment reminder${res.importedCount === 1 ? '' : 's'} from your ledger.`
          : 'All detected recurring expenses already have active reminders.'
      );
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImportingRecurring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <section aria-label="Reminder summary KPIs" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Overdue / Due Today
          </p>
          <p
            className={`mt-2 text-2xl font-bold font-mono-num ${
              (summary?.overdueCount ?? 0) + (summary?.dueTodayCount ?? 0) > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-[#101B32] dark:text-white'
            }`}
          >
            {(summary?.overdueCount ?? 0) + (summary?.dueTodayCount ?? 0)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            {summary?.overdueCount ?? 0} overdue · {summary?.dueTodayCount ?? 0} due today
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Due Within Alert Window
          </p>
          <p className="mt-2 text-2xl font-bold font-mono-num text-amber-600 dark:text-amber-300">
            {summary?.dueSoonCount ?? 0}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Triggered by reminder lead days
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Pending Obligations
          </p>
          <p className="mt-2 text-2xl font-bold font-mono-num text-[#101B32] dark:text-white">
            {formatCurrency(summary?.totalPendingAmount ?? 0, currency)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            {summary?.totalPendingCount ?? 0} scheduled payment{(summary?.totalPendingCount ?? 0) === 1 ? '' : 's'}
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Active Deadline Alerts
          </p>
          <p className="mt-2 text-2xl font-bold font-mono-num text-[#101B32] dark:text-white">
            {summary?.activeAlertCount ?? 0}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Pending EMIs, bills &amp; expenses
          </p>
        </div>
      </section>

      {/* Action Toolbar */}
      <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'ALL_PENDING', label: 'All Pending' },
                { id: 'URGENT', label: 'Overdue & Due Soon' },
                { id: 'COMPLETED', label: 'Paid / Dismissed' },
              ] as Array<{ id: FilterMode; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMode(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  filterMode === tab.id
                    ? 'bg-[#101B32] text-white border-[#101B32] dark:bg-[#4169E1] dark:border-[#4169E1]'
                    : 'bg-white dark:bg-[#0F172A] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleImportRecurring}
              disabled={importingRecurring}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-[#101B32] dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${importingRecurring ? 'animate-spin' : ''}`} />
              <span>{importingRecurring ? 'Syncing…' : 'Sync Recurring Bills'}</span>
            </button>
            <button
              type="button"
              onClick={() => setFormOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#101B32] dark:bg-[#4169E1] text-white hover:opacity-95 cursor-pointer"
            >
              {formOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{formOpen ? 'Cancel' : 'Add Reminder / EMI'}</span>
            </button>
          </div>
        </div>

        {formOpen && (
          <form
            onSubmit={handleCreate}
            className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <div className="sm:col-span-2">
              <label htmlFor="rem-title" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Reminder Title
              </label>
              <input
                id="rem-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. HDFC Car Loan EMI (14/36)"
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="rem-type" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Obligation Type
              </label>
              <select
                id="rem-type"
                value={reminderType}
                onChange={(e) => setReminderType(e.target.value as ReminderType)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
              >
                {REMINDER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rem-amount" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Amount ({currency})
              </label>
              <input
                id="rem-amount"
                type="number"
                step="0.01"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="4500"
                required
                className="w-full px-3 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="rem-due" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Due Date
              </label>
              <input
                id="rem-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="rem-recurrence" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Recurrence
              </label>
              <select
                id="rem-recurrence"
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as ReminderRecurrence)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
              >
                {RECURRENCE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rem-lead" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Alert Days Before
              </label>
              <input
                id="rem-lead"
                type="number"
                min="0"
                max="60"
                value={remindDaysBefore}
                onChange={(e) => setRemindDaysBefore(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="rem-category" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Category
              </label>
              <select
                id="rem-category"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
              >
                {(expenseCategories.length > 0
                  ? expenseCategories
                  : [{ id: 'other', name: 'Other' }]
                ).map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rem-merchant" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Payee / Lender (Optional)
              </label>
              <input
                id="rem-merchant"
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="e.g. HDFC Bank"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-2">
              <label htmlFor="rem-notes" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Notes (Optional)
              </label>
              <input
                id="rem-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Auto-debit account or reference note"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2 text-xs font-semibold rounded-lg bg-[#4169E1] text-white hover:bg-[#3358CC] disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Saving…' : 'Save Reminder'}
              </button>
            </div>
          </form>
        )}
      </section>

      {notice && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs font-medium text-emerald-800 dark:text-emerald-200"
        >
          {notice}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="px-4 py-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {/* Reminders Table */}
      <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[#4169E1]" />
            <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
              Scheduled Deadlines &amp; Pending EMIs
            </h2>
          </div>
          <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
            {filteredReminders.length} item{filteredReminders.length === 1 ? '' : 's'}
          </span>
        </div>

        {loading && reminders.length === 0 ? (
          <div className="h-40 rounded-lg bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
        ) : filteredReminders.length === 0 ? (
          <div className="py-10 text-center">
            <Bell className="w-6 h-6 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-[#101B32] dark:text-white">
              No reminders in this view
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Add a pending EMI, rent bill, or planned expense above, or sync detected recurring bills.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-3 font-medium">Due Date</th>
                  <th className="py-2.5 pr-3 font-medium">Obligation</th>
                  <th className="py-2.5 pr-3 font-medium">Type &amp; Cadence</th>
                  <th className="py-2.5 pr-3 font-medium">Alert Status</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filteredReminders.map((item) => {
                  const urgencyInfo = formatUrgencyText(item);
                  const isBusy = busyId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-3 pr-3 font-mono-num text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        <div>{item.dueDate}</div>
                        {item.lastPaidAt && (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500">
                            Paid {item.lastPaidAt.slice(0, 10)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-3 min-w-[200px]">
                        <p className="font-medium text-[#101B32] dark:text-white">{item.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.merchant ? `${item.merchant} · ` : ''}
                          {item.categoryName}
                          {item.notes ? ` — ${item.notes}` : ''}
                        </p>
                      </td>
                      <td className="py-3 pr-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        <span className="font-semibold text-[#101B32] dark:text-white">
                          {item.reminderType}
                        </span>{' '}
                        · {item.recurrence.toLowerCase()}
                      </td>
                      <td className="py-3 pr-3 text-xs whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 ${urgencyInfo.colorClass}`}>
                          {(item.urgency === 'OVERDUE' || item.urgency === 'DUE_TODAY') && (
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          )}
                          {item.urgency === 'PAID' && (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{urgencyInfo.label}</span>
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono-num font-semibold text-[#101B32] dark:text-white whitespace-nowrap">
                        {formatCurrency(item.amount, currency)}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {item.status === 'PENDING' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleMarkPaid(item)}
                              aria-label={`Mark ${item.title} as paid`}
                              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                            >
                              {item.recurrence === 'ONCE' ? 'Mark Paid' : 'Mark Paid & Advance'}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDismissToggle(item)}
                            aria-label={
                              item.status === 'DISMISSED'
                                ? `Reactivate ${item.title}`
                                : `Dismiss ${item.title}`
                            }
                            className="px-2 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                          >
                            {item.status === 'DISMISSED' ? 'Reactivate' : 'Dismiss'}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDelete(item)}
                            aria-label={`Delete ${item.title}`}
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
