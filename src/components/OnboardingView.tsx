import { useState } from 'react';
import { Database, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { api, type UserProfileResponse } from '../lib/api.ts';

interface OnboardingViewProps {
  profile: UserProfileResponse;
  onCompleted: () => Promise<void>;
  onGoToUpload: () => void;
}

export function OnboardingView({ profile, onCompleted, onGoToUpload }: OnboardingViewProps) {
  const [currency, setCurrency] = useState<'INR' | 'USD' | 'EUR' | 'GBP'>(profile.currency || 'INR');
  const [openingBalance, setOpeningBalance] = useState<string>(
    profile.openingBalance !== null ? String(profile.openingBalance) : ''
  );
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savePreferences = async () => {
    setSaving(true);
    setError(null);
    try {
      const parsedBal =
        openingBalance.trim() === '' ? null : Number(openingBalance.replace(/,/g, ''));
      if (parsedBal !== null && !Number.isFinite(parsedBal)) {
        throw new Error('Opening balance must be a valid number.');
      }
      await api.updateProfile({
        currency,
        openingBalance: parsedBal,
        onboardingCompleted: true,
      });
      await onCompleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadDemo = async () => {
    setLoadingDemo(true);
    setError(null);
    try {
      await api.updateProfile({
        currency,
        onboardingCompleted: true,
      });
      await api.loadDemoDataset();
      await onCompleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="p-6 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]">
        <p className="text-xs font-semibold text-[#4169E1] dark:text-[#7D9BFF] mb-2">
          Workspace Setup
        </p>
        <h2 className="text-2xl font-bold text-[#101B32] dark:text-white">
          Welcome to FinPilot AI
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
          Configure your primary reporting currency and choose how you want to populate your
          ledger. Your records remain strictly isolated to your authenticated profile.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div>
            <label
              htmlFor="onboarding-currency"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Reporting Currency
            </label>
            <select
              id="onboarding-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD' | 'EUR' | 'GBP')}
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
            >
              <option value="INR">INR (Indian Rupee)</option>
              <option value="USD">USD (US Dollar)</option>
              <option value="EUR">EUR (Euro)</option>
              <option value="GBP">GBP (British Pound)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="onboarding-balance"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Opening Bank Balance (Optional)
            </label>
            <input
              id="onboarding-balance"
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="e.g. 65000"
              className="w-full px-3 py-2.5 text-sm font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
            />
          </div>
        </div>

        <div className="mt-5 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-[#F6F8FC] dark:bg-[#0F172A] flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-[#35B88A] shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            FinPilot AI never requests bank passwords, UPI PINs, or OTPs. Projected account balances
            are only computed when you explicitly provide an opening balance.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleLoadDemo}
            disabled={loadingDemo || saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#4169E1] hover:bg-[#3358CC] rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
          >
            <Database className="w-4 h-4" />
            <span>{loadingDemo ? 'Loading Demo Dataset...' : 'Load Synthetic Indian Demo Dataset'}</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await savePreferences();
              onGoToUpload();
            }}
            disabled={loadingDemo || saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#101B32] dark:text-white bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Upload Bank CSV Statement</span>
          </button>

          <button
            type="button"
            onClick={savePreferences}
            disabled={loadingDemo || saving}
            className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-[#101B32] dark:hover:text-white cursor-pointer"
          >
            {saving ? 'Saving...' : 'Start with Empty Ledger'}
          </button>
        </div>
      </div>
    </div>
  );
}
