import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart2,
  Bell,
  Bot,
  CalendarClock,
  CheckCircle2,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react';
import type { ReminderSummary } from '../core/types.ts';
import { formatCurrency } from '../lib/format.ts';

export type NavTab =
  | 'overview'
  | 'transactions'
  | 'analytics'
  | 'forecasts'
  | 'reminders'
  | 'copilot'
  | 'settings';

interface AppShellProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  userName: string;
  currency?: string;
  isDemo: boolean;
  darkMode: boolean;
  onToggleDark: () => void;
  onSignOut: () => void;
  reminderSummary?: ReminderSummary | null;
  onMarkReminderPaid?: (id: string) => Promise<void>;
  children: ReactNode;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'forecasts', label: 'Forecasts', icon: TrendingUp },
  { id: 'reminders', label: 'Reminders', icon: CalendarClock },
  { id: 'copilot', label: 'AI Copilot', icon: Bot },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function AppShell({
  activeTab,
  onSelectTab,
  userName,
  currency = 'INR',
  isDemo,
  darkMode,
  onToggleDark,
  onSignOut,
  reminderSummary,
  onMarkReminderPaid,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const notifContainerRef = useRef<HTMLDivElement | null>(null);

  const activeTitle = NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Overview';
  const alertCount = reminderSummary?.activeAlertCount ?? 0;
  const urgentItems = reminderSummary?.urgentReminders ?? [];

  useEffect(() => {
    if (!notifOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (notifContainerRef.current && !notifContainerRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [notifOpen]);

  const handleQuickMarkPaid = async (id: string) => {
    if (!onMarkReminderPaid) return;
    setMarkingId(id);
    try {
      await onMarkReminderPaid(id);
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] text-[#202B40] dark:bg-[#0B1222] dark:text-[#EDF2FA] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
        <div className="h-16 px-5 flex items-center border-b border-slate-200 dark:border-slate-800">
          <span className="text-lg font-bold tracking-tight text-[#101B32] dark:text-white whitespace-nowrap">
            FinPilot AI
          </span>
        </div>

        <nav aria-label="Workspace navigation" className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const showCount = item.id === 'reminders' && alertCount > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#101B32] text-white dark:bg-[#4169E1]'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-[#101B32] dark:hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {showCount && (
                  <span
                    className={`font-mono-num text-xs font-semibold ${
                      active ? 'text-amber-200' : 'text-amber-600 dark:text-amber-300'
                    }`}
                  >
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <p className="font-semibold text-[#101B32] dark:text-white truncate">{userName}</p>
            <p className="mt-0.5">{isDemo ? 'Synthetic INR Sandbox' : 'Authenticated Account'}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{isDemo ? 'Exit Demo' : 'Sign Out'}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white dark:bg-[#0F172A] h-full border-r border-slate-200 dark:border-slate-800 flex flex-col z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="text-base font-bold text-[#101B32] dark:text-white">
                FinPilot AI
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 rounded-lg text-slate-500 hover:text-[#101B32] dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav aria-label="Mobile navigation" className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                const showCount = item.id === 'reminders' && alertCount > 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#101B32] text-white dark:bg-[#4169E1]'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {showCount && (
                      <span
                        className={`font-mono-num text-xs font-semibold ${
                          active ? 'text-amber-200' : 'text-amber-600 dark:text-amber-300'
                        }`}
                      >
                        {alertCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSignOut();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{isDemo ? 'Exit Demo' : 'Sign Out'}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 lg:h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">
                Workspace
              </span>
              <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">/</span>
              <h1 className="text-base sm:text-lg font-semibold text-[#101B32] dark:text-white truncate">
                {activeTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isDemo && (
              <span className="hidden sm:inline text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">
                Demo Dataset · Synthetic INR
              </span>
            )}

            {/* Notification Bell Popover */}
            <div ref={notifContainerRef} className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-expanded={notifOpen}
                aria-label={`Deadline notifications (${alertCount} urgent)`}
                className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {alertCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold font-mono-num flex items-center justify-center">
                    {alertCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  role="dialog"
                  aria-label="Upcoming expense and EMI notifications"
                  className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111B30] shadow-xl z-40 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#101B32] dark:text-white">
                        Payment Deadlines &amp; EMIs
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {alertCount > 0
                          ? `${alertCount} urgent item${alertCount === 1 ? '' : 's'} needing attention`
                          : 'No overdue or imminent deadlines'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectTab('reminders');
                        setNotifOpen(false);
                      }}
                      className="text-xs font-semibold text-[#4169E1] dark:text-[#7D9BFF] hover:underline cursor-pointer"
                    >
                      Open Reminders
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {urgentItems.length === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-500 dark:text-slate-400">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
                        You are all caught up on bills, expenses, and EMIs.
                      </div>
                    ) : (
                      urgentItems.slice(0, 6).map((item) => (
                        <div key={item.id} className="p-3.5 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs">
                              <AlertTriangle
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  item.urgency === 'OVERDUE'
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-amber-600 dark:text-amber-300'
                                }`}
                              />
                              <span
                                className={`font-semibold ${
                                  item.urgency === 'OVERDUE'
                                    ? 'text-red-700 dark:text-red-400'
                                    : 'text-amber-700 dark:text-amber-300'
                                }`}
                              >
                                {item.urgency === 'OVERDUE'
                                  ? `Overdue ${Math.abs(item.daysUntilDue ?? 0)}d`
                                  : item.urgency === 'DUE_TODAY'
                                  ? 'Due today'
                                  : `Due in ${item.daysUntilDue ?? 0}d`}
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="font-mono-num text-slate-500 dark:text-slate-400">
                                {item.dueDate}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-[#101B32] dark:text-white mt-0.5 truncate">
                              {item.title}
                            </p>
                            <p className="text-xs font-mono-num text-slate-600 dark:text-slate-300 mt-0.5">
                              {formatCurrency(item.amount, currency)} · {item.reminderType}
                            </p>
                          </div>
                          {onMarkReminderPaid && (
                            <button
                              type="button"
                              disabled={markingId === item.id}
                              onClick={() => void handleQuickMarkPaid(item.id)}
                              aria-label={`Quick mark ${item.title} paid`}
                              className="shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                            >
                              {markingId === item.id ? '…' : 'Mark Paid'}
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onToggleDark}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
