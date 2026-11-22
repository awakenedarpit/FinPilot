import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import type {
  AnomalyAlert,
  CategoryRecord,
  CategorySpendSummary,
  ForecastOutput,
  MerchantSummary,
  MonthlyTrendPoint,
  OverviewMetrics,
  PaymentReminderRecord,
  RecurringCandidate,
  ReminderSummary,
  TransactionRecord,
} from './core/types.ts';
import {
  api,
  setAuthTokenProvider,
  type FinancialGoalItem,
  type UserProfileResponse,
} from './lib/api.ts';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { AnalyticsView } from './components/AnalyticsView.tsx';
import { AppShell, type NavTab } from './components/AppShell.tsx';
import { CopilotView } from './components/CopilotView.tsx';
import { ForecastsView } from './components/ForecastsView.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { OnboardingView } from './components/OnboardingView.tsx';
import { OverviewView } from './components/OverviewView.tsx';
import { RemindersView } from './components/RemindersView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { TransactionsView } from './components/TransactionsView.tsx';

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('finpilot_theme') === 'dark';
  });

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [demoToken, setDemoToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [openImportOnTx, setOpenImportOnTx] = useState(false);

  // Workspace Data State
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [trends, setTrends] = useState<MonthlyTrendPoint[]>([]);
  const [spendingCategories, setSpendingCategories] = useState<CategorySpendSummary[]>([]);
  const [merchants, setMerchants] = useState<MerchantSummary[]>([]);
  const [recurring, setRecurring] = useState<RecurringCandidate[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionRecord[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>([]);
  const [forecast, setForecast] = useState<ForecastOutput | null>(null);
  const [goals, setGoals] = useState<FinancialGoalItem[]>([]);
  const [reminders, setReminders] = useState<PaymentReminderRecord[]>([]);
  const [reminderSummary, setReminderSummary] = useState<ReminderSummary | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    window.localStorage.setItem('finpilot_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const isSignedIn = Boolean(firebaseUser || demoToken);

  // Bind memory-only token provider
  useEffect(() => {
    if (firebaseUser) {
      setAuthTokenProvider(() => firebaseUser.getIdToken());
    } else if (demoToken) {
      setAuthTokenProvider(async () => demoToken);
    } else {
      setAuthTokenProvider(null);
    }
  }, [firebaseUser, demoToken]);

  const refreshWorkspace = useCallback(async () => {
    if (!firebaseUser && !demoToken) return;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const [prof, cats, ov, tr, sp, rec, txRes, anom, fc, gl, remRes] = await Promise.all([
        api.getProfile(),
        api.getCategories(),
        api.getOverview(),
        api.getTrends(),
        api.getSpending(),
        api.getRecurring(),
        api.listTransactions({ pageSize: 10 }),
        api.getAnomalies(),
        api.getForecasts(),
        api.getGoals(),
        api.getReminders(),
      ]);
      setProfile(prof);
      setCategories(cats.categories);
      setOverview(ov);
      setTrends(tr.trends);
      setSpendingCategories(sp.categories);
      setMerchants(sp.merchants);
      setRecurring(rec.recurring);
      setRecentTransactions(txRes.items);
      setAnomalies(anom.alerts);
      setForecast(fc);
      setGoals(gl.goals);
      setReminders(remRes.reminders);
      setReminderSummary(remRes.summary);
    } catch (err) {
      setWorkspaceError((err as Error).message);
    } finally {
      setWorkspaceLoading(false);
    }
  }, [firebaseUser, demoToken]);

  useEffect(() => {
    if (isSignedIn) {
      void refreshWorkspace();
    }
  }, [isSignedIn, refreshWorkspace]);

  const handleStartDemo = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await api.createDemoSession();
      setAuthTokenProvider(async () => res.token);
      setDemoToken(res.token);
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // Support ?autostart=1 to jump straight into the interactive Demo Workspace
  useEffect(() => {
    if (!authReady) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && !firebaseUser && !demoToken && !authLoading) {
      void handleStartDemo();
    }
  }, [authReady, firebaseUser, demoToken, authLoading, handleStartDemo]);

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
      setDemoToken(null);
    } catch (err) {
      const msg = (err as Error).message || 'Google sign-in failed.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setDemoToken(null);
    setProfile(null);
    setOverview(null);
    setAuthTokenProvider(null);
    if (firebaseUser) {
      await signOut(auth);
    }
  };

  if (!isSignedIn) {
    return (
      <LandingPage
        onStartDemo={handleStartDemo}
        onGoogleSignIn={handleGoogleSignIn}
        authLoading={authLoading}
        authError={authError}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
      />
    );
  }

  const displayName =
    profile?.fullName ||
    firebaseUser?.displayName ||
    firebaseUser?.email ||
    'Aarav Sharma (Demo)';

  const currency = profile?.currency || 'INR';

  // Show Onboarding for newly signed-in users who haven't completed setup
  const needsOnboarding =
    profile && !profile.onboardingCompleted && !profile.isDemo && (overview?.transactionCount ?? 0) === 0;

  return (
    <AppShell
      activeTab={activeTab}
      onSelectTab={(tab) => {
        setOpenImportOnTx(false);
        setActiveTab(tab);
      }}
      userName={displayName}
      currency={currency}
      isDemo={Boolean(profile?.isDemo || demoToken)}
      darkMode={darkMode}
      onToggleDark={() => setDarkMode((d) => !d)}
      onSignOut={() => void handleSignOut()}
      reminderSummary={reminderSummary}
      onMarkReminderPaid={async (id) => {
        await api.markReminderPaid(id);
        await refreshWorkspace();
      }}
    >
      {workspaceError && (
        <div
          role="alert"
          className="mb-5 p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-4"
        >
          <span>{workspaceError}</span>
          <button
            type="button"
            onClick={() => void refreshWorkspace()}
            className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded-lg cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {needsOnboarding ? (
        <OnboardingView
          profile={profile}
          onCompleted={refreshWorkspace}
          onGoToUpload={() => {
            setOpenImportOnTx(true);
            setActiveTab('transactions');
          }}
        />
      ) : (
        <>
          {activeTab === 'overview' && (
            <OverviewView
              overview={overview}
              trends={trends}
              recentTransactions={recentTransactions}
              anomalies={anomalies}
              forecast={forecast}
              goals={goals}
              reminderSummary={reminderSummary}
              loading={workspaceLoading}
              onNavigate={(tab) => {
                setOpenImportOnTx(false);
                setActiveTab(tab);
              }}
              onRefresh={refreshWorkspace}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsView
              currency={currency}
              categories={categories}
              onDataChanged={refreshWorkspace}
              initialOpenImport={openImportOnTx}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView
              currency={currency}
              accountLabel={displayName}
              categories={spendingCategories}
              merchants={merchants}
              trends={trends}
              recurring={recurring}
              loading={workspaceLoading}
            />
          )}

          {activeTab === 'forecasts' && (
            <ForecastsView
              currency={currency}
              trends={trends}
              forecast={forecast}
              anomalies={anomalies}
              onRefresh={refreshWorkspace}
            />
          )}

          {activeTab === 'reminders' && (
            <RemindersView
              currency={currency}
              categories={categories}
              reminders={reminders}
              summary={reminderSummary}
              loading={workspaceLoading}
              onRefresh={refreshWorkspace}
            />
          )}

          {activeTab === 'copilot' && <CopilotView currency={currency} />}

          {activeTab === 'settings' && profile && (
            <SettingsView
              profile={profile}
              onProfileUpdated={refreshWorkspace}
              onSignOut={() => void handleSignOut()}
            />
          )}
        </>
      )}
    </AppShell>
  );
}
