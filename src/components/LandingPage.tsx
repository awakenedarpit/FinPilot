import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bot,
  FileSpreadsheet,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
  TrendingUp,
} from 'lucide-react';

interface LandingPageProps {
  onStartDemo: () => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  authLoading: boolean;
  authError: string | null;
  darkMode: boolean;
  onToggleDark: () => void;
}

export function LandingPage({
  onStartDemo,
  onGoogleSignIn,
  authLoading,
  authError,
  darkMode,
  onToggleDark,
}: LandingPageProps) {
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  return (
    <div className="min-h-screen bg-[#F6F8FC] text-[#202B40] dark:bg-[#0B1222] dark:text-[#EDF2FA] transition-colors">
      {/* Strict 3-zone Top Bar Contract */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0F172A]/90 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-[#101B32] dark:text-white whitespace-nowrap shrink-0"
          >
            FinPilot AI
          </a>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <a
              href="#capabilities"
              className="hover:text-[#101B32] dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#101B32] dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#security"
              className="hover:text-[#101B32] dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Security
            </a>
            <a
              href="#architecture"
              className="hover:text-[#101B32] dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Architecture
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onStartDemo}
              disabled={authLoading}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#101B32] hover:bg-[#1E2E52] dark:bg-[#4169E1] dark:hover:bg-[#3457C5] rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
            >
              {authLoading ? 'Opening...' : 'Open Demo Workspace'}
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-semibold tracking-wide text-[#4169E1] dark:text-[#7D9BFF] mb-3">
                Personal Financial Intelligence · Built for INR &amp; Global Ledgers
              </p>
              <h1
                className="text-4xl sm:text-5xl font-bold tracking-tight text-[#101B32] dark:text-white leading-[1.12] mb-5"
                style={{ textWrap: 'balance' }}
              >
                Your Money. Understood. Your Future. Prepared.
              </h1>
              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mb-8">
                Transform raw bank CSV statements into deterministic spending analytics, explainable
                anomaly alerts, statistical cash-flow forecasts, and a tool-grounded Gemini AI
                Copilot that never fabricates numbers.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onStartDemo}
                  disabled={authLoading}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#4169E1] hover:bg-[#3358CC] rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
                >
                  <span>Try Interactive Demo</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={authLoading}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[#101B32] dark:text-white bg-white dark:bg-[#111B30] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
                >
                  <span>Sign In with Google</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleDark}
                  aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111B30] text-slate-600 dark:text-slate-300 hover:text-[#101B32] dark:hover:text-white transition-colors cursor-pointer"
                >
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>

              {authError && (
                <div
                  role="alert"
                  className="mt-4 p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300"
                >
                  {authError}
                </div>
              )}

              <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                <span>PostgreSQL Ledger</span>
                <span aria-hidden="true">·</span>
                <span>Zero Bank Password Scraping</span>
                <span aria-hidden="true">·</span>
                <span>Tool-Grounded Copilot</span>
              </div>
            </div>

            <div className="lg:col-span-6 flex">
              <div className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] min-h-[280px] lg:min-h-[420px] flex items-center justify-center">
                {!heroImageFailed ? (
                  <img
                    src="/src/assets/images/hero_finpilot_workspace_1794943527379.jpg"
                    alt="FinPilot AI financial planning workspace with analytical ledger view"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImageFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full p-8 bg-gradient-to-br from-[#101B32] to-[#1E335C] text-white flex flex-col justify-between">
                    <BarChart3 className="w-10 h-10 text-[#35B88A]" />
                    <div>
                      <p className="text-lg font-semibold">FinPilot AI Workspace</p>
                      <p className="text-sm text-slate-300 mt-1">
                        Deterministic cash-flow analytics, anomaly review, and scenario modeling.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Core Capabilities */}
        <section
          id="capabilities"
          className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] py-16"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="max-w-2xl mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#101B32] dark:text-white tracking-tight">
                Engineered for financial clarity, not guesswork
              </h2>
              <p className="text-slate-600 dark:text-slate-300 mt-2">
                Every metric, forecast range, and anomaly alert is computed deterministically on the
                server before the AI Copilot translates it into plain language.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F6F8FC] dark:bg-[#111B30]">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#4169E1] dark:text-[#7D9BFF] mb-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>01. Statement Ingestion &amp; Hybrid Classification</span>
                </div>
                <h3 className="text-lg font-semibold text-[#101B32] dark:text-white mb-2">
                  Preview, validate, and deduplicate bank CSVs before saving
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Automatically maps Date, Narration, Debit, Credit, and Merchant columns. Flags
                  invalid rows without silently dropping them, skips duplicate entries via SHA-256
                  idempotency hashes, and classifies merchants like Swiggy, BESCOM, Uber, and
                  salary credits with transparent confidence scores.
                </p>
              </div>

              <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F6F8FC] dark:bg-[#111B30]">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#35B88A] mb-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>02. MAD &amp; IQR Anomalies</span>
                </div>
                <h3 className="text-lg font-semibold text-[#101B32] dark:text-white mb-2">
                  Explainable unusual activity alerts
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Flags spending spikes, outlier purchases, and possible 48-hour duplicate charges
                  with historical category baselines instead of unexplained black-box scores.
                </p>
              </div>

              <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F6F8FC] dark:bg-[#111B30]">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#8275E5] mb-2">
                  <TrendingUp className="w-4 h-4" />
                  <span>03. EWMA Cash-Flow Forecasting</span>
                </div>
                <h3 className="text-lg font-semibold text-[#101B32] dark:text-white mb-2">
                  Honest predictions with uncertainty bounds
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Projects upcoming monthly income, expenses, and recurring commitments when
                  sufficient history exists—and clearly reports insufficient-data gaps when it
                  does not.
                </p>
              </div>

              <div className="md:col-span-2 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F6F8FC] dark:bg-[#111B30]">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#4169E1] dark:text-[#7D9BFF] mb-2">
                  <Bot className="w-4 h-4" />
                  <span>04. Tool-Grounded Gemini AI Copilot &amp; Scenario Simulator</span>
                </div>
                <h3 className="text-lg font-semibold text-[#101B32] dark:text-white mb-2">
                  Ask questions and model what-if budgets against real data
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Our central AI orchestrator invokes six registered financial tools scoped strictly
                  to your authenticated account, returning evidence cards with exact figures and
                  graceful deterministic fallbacks if the AI provider is unavailable.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works & Security */}
        <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div>
              <h2 className="text-2xl font-bold text-[#101B32] dark:text-white mb-6">
                How FinPilot AI works
              </h2>
              <div className="space-y-5">
                <div className="pb-5 border-b border-slate-200 dark:border-slate-800">
                  <p className="text-sm font-semibold text-[#101B32] dark:text-white">
                    01. Import your statement or launch the Indian INR sample ledger
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    Review column detection, invalid row warnings, and duplicate checks in a live
                    preview before writing anything to PostgreSQL.
                  </p>
                </div>
                <div className="pb-5 border-b border-slate-200 dark:border-slate-800">
                  <p className="text-sm font-semibold text-[#101B32] dark:text-white">
                    02. Inspect deterministic cash flow, recurring bills, and anomalies
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    Correct any category inline, track recurring commitments like rent and broadband,
                    and review statistical outlier alerts.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#101B32] dark:text-white">
                    03. Simulate decisions and query your Copilot with evidence
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    Test reducing shopping by 15% or adding a new EMI before committing, and see the
                    exact tool results backing every Copilot answer.
                  </p>
                </div>
              </div>
            </div>

            <div
              id="security"
              className="p-6 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30]"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-[#101B32] dark:text-white mb-4">
                <Lock className="w-4 h-4 text-[#35B88A]" />
                <span>Security, Privacy &amp; Honest Boundaries</span>
              </div>
              <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <li>
                  <strong className="text-[#101B32] dark:text-white font-semibold">
                    No bank credential collection:
                  </strong>{' '}
                  FinPilot AI never asks for banking passwords, UPI PINs, or OTPs. Live Account
                  Aggregator sync is clearly disabled in this MVP until licensed sandbox approval.
                </li>
                <li>
                  <strong className="text-[#101B32] dark:text-white font-semibold">
                    Strict per-user isolation:
                  </strong>{' '}
                  All API queries derive identity from verified authentication tokens on the server
                  and scope PostgreSQL records strictly by user ID.
                </li>
                <li>
                  <strong className="text-[#101B32] dark:text-white font-semibold">
                    Synthetic demo separation:
                  </strong>{' '}
                  Demo transactions are explicitly labelled as synthetic INR data and never mixed
                  into personal records without user action.
                </li>
                <li id="architecture">
                  <strong className="text-[#101B32] dark:text-white font-semibold">
                    Server-side AI keys:
                  </strong>{' '}
                  Gemini API calls execute exclusively on the backend; the AI model cannot run SQL
                  or arbitrary code.
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>FinPilot AI · Personal Financial Intelligence Platform</span>
          <div className="flex items-center gap-5">
            <a href="/api/v1/demo/sample-csv" className="hover:text-[#101B32] dark:hover:text-white">
              Download Sample CSV
            </a>
            <button
              type="button"
              onClick={onStartDemo}
              className="hover:text-[#101B32] dark:hover:text-white cursor-pointer"
            >
              Launch Demo Workspace
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
