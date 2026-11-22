import { useEffect, useState } from 'react';
import { CheckCircle2, Database, Link2Off, Shield } from 'lucide-react';
import { api, type UserProfileResponse } from '../lib/api.ts';

interface SettingsViewProps {
  profile: UserProfileResponse;
  onProfileUpdated: () => Promise<void>;
  onSignOut: () => void;
}

export function SettingsView({ profile, onProfileUpdated, onSignOut }: SettingsViewProps) {
  const [fullName, setFullName] = useState(profile.fullName || '');
  const [currency, setCurrency] = useState<'INR' | 'USD' | 'EUR' | 'GBP'>(profile.currency);
  const [openingBalance, setOpeningBalance] = useState(
    profile.openingBalance !== null ? String(profile.openingBalance) : ''
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<
    Array<{ providerId: string; providerName: string; status: string; message: string }>
  >([]);

  useEffect(() => {
    api
      .getIntegrations()
      .then((res) => setIntegrations(res.providers))
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const bal = openingBalance.trim() === '' ? null : Number(openingBalance);
      if (bal !== null && !Number.isFinite(bal)) {
        throw new Error('Opening balance must be a valid number.');
      }
      await api.updateProfile({
        fullName: fullName.trim() || null,
        currency,
        openingBalance: bal,
      });
      await onProfileUpdated();
      setMessage('Profile and currency preferences saved.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <form
        onSubmit={handleSave}
        className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] space-y-4"
      >
        <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
          Profile &amp; Ledger Preferences
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="set-name" className="block text-xs font-medium mb-1">
              Display Name
            </label>
            <input
              id="set-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
            />
          </div>
          <div>
            <label htmlFor="set-email" className="block text-xs font-medium mb-1">
              Account Email
            </label>
            <input
              id="set-email"
              type="email"
              disabled
              value={profile.email}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1222] text-slate-500"
            />
          </div>
          <div>
            <label htmlFor="set-currency" className="block text-xs font-medium mb-1">
              Currency
            </label>
            <select
              id="set-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD' | 'EUR' | 'GBP')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
          <div>
            <label htmlFor="set-opening-balance" className="block text-xs font-medium mb-1">
              Opening Balance (Optional)
            </label>
            <input
              id="set-opening-balance"
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="Leave blank if unknown"
              className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
            />
          </div>
        </div>

        {message && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4" />
            <span>{message}</span>
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#4169E1] hover:bg-[#3358CC] rounded-lg cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Synthetic Demo Controls */}
      <section className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[#4169E1]" />
          <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
            Synthetic Demo Dataset Controls
          </h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Demo transactions are tagged explicitly with source DEMO. Load or clear them without
          affecting your manually entered or CSV-imported records.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={async () => {
              await api.loadDemoDataset();
              await onProfileUpdated();
              setMessage('Synthetic Indian demo dataset loaded.');
            }}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#101B32] dark:bg-[#4169E1] rounded-lg cursor-pointer"
          >
            Load Demo Transactions
          </button>
          <button
            type="button"
            onClick={async () => {
              const res = await api.clearDemoDataset();
              await onProfileUpdated();
              setMessage(`Removed ${res.removed} synthetic demo transaction(s).`);
            }}
            className="px-3.5 py-2 text-xs font-semibold text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
          >
            Clear Demo Transactions
          </button>
        </div>
      </section>

      {/* Authorized Integrations Honest Adapter Card */}
      <section className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] space-y-3">
        <div className="flex items-center gap-2">
          <Link2Off className="w-4 h-4 text-slate-500" />
          <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
            Authorized Bank Integrations
          </h2>
        </div>
        {integrations.map((p) => (
          <div
            key={p.providerId}
            className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-[#F6F8FC] dark:bg-[#0F172A] text-xs space-y-1"
          >
            <p className="font-semibold text-[#101B32] dark:text-white">
              {p.providerName} · Status: {p.status.replace('_', ' ')}
            </p>
            <p className="text-slate-600 dark:text-slate-300">{p.message}</p>
          </div>
        ))}
      </section>

      {/* Privacy & Session */}
      <section className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-[#35B88A] shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Session protected by verified authentication tokens and user-scoped PostgreSQL queries.
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="px-4 py-2 text-xs font-semibold text-[#101B32] dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
        >
          {profile.isDemo ? 'Exit Demo Workspace' : 'Sign Out'}
        </button>
      </section>
    </div>
  );
}
