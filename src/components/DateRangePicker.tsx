import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';
import {
  computeDateRangePreset,
  type DateRangePresetId,
  validateDateRange,
} from '../core/transactionFilters.ts';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}

const PRESETS: Array<{ id: DateRangePresetId; label: string }> = [
  { id: 'all', label: 'All Dates' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_30', label: 'Last 30 Days' },
  { id: 'last_90', label: 'Last 90 Days' },
];

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftStart(startDate);
    setDraftEnd(endDate);
    setRangeError(validateDateRange(startDate, endDate));
  }, [startDate, endDate]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const hasRange = Boolean(startDate || endDate);

  const summaryLabel = (() => {
    if (startDate && endDate) return `${startDate} – ${endDate}`;
    if (startDate) return `From ${startDate}`;
    if (endDate) return `Until ${endDate}`;
    return 'All Dates';
  })();

  const handleDraftChange = (nextStart: string, nextEnd: string) => {
    setDraftStart(nextStart);
    setDraftEnd(nextEnd);
    const err = validateDateRange(nextStart, nextEnd);
    setRangeError(err);
    if (!err) {
      onChange(nextStart, nextEnd);
    }
  };

  const handlePresetClick = (presetId: DateRangePresetId) => {
    const next = computeDateRangePreset(presetId);
    setDraftStart(next.startDate);
    setDraftEnd(next.endDate);
    setRangeError(null);
    onChange(next.startDate, next.endDate);
    setOpen(false);
  };

  const handleClear = () => {
    setDraftStart('');
    setDraftEnd('');
    setRangeError(null);
    onChange('', '');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <span className="block text-xs font-medium text-slate-500 mb-1">Date Range</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Date range filter: ${summaryLabel}`}
          onClick={() => setOpen((v) => !v)}
          className={`flex-1 flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-lg border bg-white dark:bg-[#0F172A] text-left cursor-pointer transition-colors ${
            hasRange
              ? 'border-[#4169E1] text-[#101B32] dark:text-white font-medium'
              : 'border-slate-200 dark:border-slate-700 text-[#101B32] dark:text-white'
          }`}
        >
          <span className="inline-flex items-center gap-2 min-w-0 truncate">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-mono-num truncate">{summaryLabel}</span>
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {hasRange && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear date range"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-500 hover:text-[#101B32] dark:hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Select custom date range"
          className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-80 max-w-[calc(100vw-2rem)] p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111B30] shadow-lg z-30 space-y-4"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Quick Presets
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetClick(preset.id)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-[#F6F8FC] dark:bg-[#0F172A] text-slate-700 dark:text-slate-200 hover:border-[#4169E1] hover:text-[#4169E1] dark:hover:text-[#7D9BFF] cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Custom Range
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="drp-start-date"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                >
                  Start Date
                </label>
                <input
                  id="drp-start-date"
                  type="date"
                  value={draftStart}
                  max={draftEnd || undefined}
                  onChange={(e) => handleDraftChange(e.target.value, draftEnd)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="drp-end-date"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                >
                  End Date
                </label>
                <input
                  id="drp-end-date"
                  type="date"
                  value={draftEnd}
                  min={draftStart || undefined}
                  onChange={(e) => handleDraftChange(draftStart, e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
                />
              </div>
            </div>

            {rangeError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {rangeError}
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-medium text-slate-500 hover:text-[#101B32] dark:hover:text-white cursor-pointer"
            >
              Reset Dates
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={Boolean(rangeError)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#4169E1] hover:bg-[#3358CC] rounded-lg disabled:opacity-50 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
