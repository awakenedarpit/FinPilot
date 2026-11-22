import type {
  AnomalyAlert,
  CategoryRecord,
  CategorySpendSummary,
  CopilotResponsePayload,
  CsvPreviewResult,
  ForecastOutput,
  MerchantSummary,
  MonthlyTrendPoint,
  OverviewMetrics,
  PaymentReminderRecord,
  RecurringCandidate,
  ReminderRecurrence,
  ReminderStatus,
  ReminderSummary,
  ReminderType,
  SimulationInput,
  SimulationOutput,
  TransactionRecord,
  TransactionType,
} from '../core/types.ts';

let authTokenProvider: (() => Promise<string | null>) | null = null;

export function setAuthTokenProvider(provider: (() => Promise<string | null>) | null) {
  authTokenProvider = provider;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (authTokenProvider) {
    const token = await authTokenProvider();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export interface UserProfileResponse {
  uid: string;
  email: string;
  fullName: string | null;
  currency: 'INR' | 'USD' | 'EUR' | 'GBP';
  openingBalance: number | null;
  onboardingCompleted: boolean;
  createdAt: string;
  isDemo: boolean;
}

export interface FinancialGoalItem {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  createdAt: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolMetadata: {
    intent?: string;
    tools_used?: string[];
    evidence?: CopilotResponsePayload['evidence'];
    limitations?: string[];
    fallback_used?: boolean;
    generated_at?: string;
  } | null;
  createdAt: string;
}

export const api = {
  createDemoSession: () =>
    apiFetch<{
      token: string;
      user: { uid: string; email: string; name: string; isDemo: boolean };
    }>('/auth/demo-session', { method: 'POST' }),

  getProfile: () => apiFetch<UserProfileResponse>('/profile'),

  updateProfile: (payload: {
    fullName?: string | null;
    currency?: 'INR' | 'USD' | 'EUR' | 'GBP';
    openingBalance?: number | null;
    onboardingCompleted?: boolean;
  }) =>
    apiFetch<UserProfileResponse>('/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getCategories: () => apiFetch<{ categories: CategoryRecord[] }>('/categories'),

  listTransactions: (params: {
    search?: string;
    category?: string;
    type?: TransactionType | 'ALL';
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category && params.category !== 'ALL') qs.set('category', params.category);
    if (params.type && params.type !== 'ALL') qs.set('type', params.type);
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    const query = qs.toString();
    return apiFetch<{
      items: TransactionRecord[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/transactions${query ? `?${query}` : ''}`);
  },

  exportTransactionsCsv: async (
    params: {
      search?: string;
      category?: string;
      type?: TransactionType | 'ALL';
      startDate?: string;
      endDate?: string;
    } = {}
  ): Promise<{ csvText: string; filename: string; rowCount: number }> => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category && params.category !== 'ALL') qs.set('category', params.category);
    if (params.type && params.type !== 'ALL') qs.set('type', params.type);
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    const query = qs.toString();

    const headers = new Headers();
    if (authTokenProvider) {
      const token = await authTokenProvider();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    const res = await fetch(`/api/v1/transactions/export${query ? `?${query}` : ''}`, {
      headers,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Export failed with status ${res.status}`);
    }

    const csvText = await res.text();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename =
      match?.[1] || `finpilot-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    const rowCountHeader = Number(res.headers.get('X-Export-Row-Count'));
    const rowCount = Number.isFinite(rowCountHeader)
      ? rowCountHeader
      : Math.max(0, csvText.trim().split(/\r?\n/).length - 1);

    return { csvText, filename, rowCount };
  },

  createTransaction: (payload: {
    description: string;
    merchant?: string | null;
    amount: number;
    transactionType: TransactionType;
    transactionDate: string;
    categoryName?: string;
    isRecurring?: boolean;
  }) =>
    apiFetch<TransactionRecord>('/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTransaction: (
    id: string,
    payload: {
      categoryName?: string;
      description?: string;
      merchant?: string;
      amount?: number;
      transactionDate?: string;
      isRecurring?: boolean;
    }
  ) =>
    apiFetch<TransactionRecord>(`/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteTransaction: (id: string) =>
    apiFetch<{ deleted: boolean; id: string }>(`/transactions/${id}`, {
      method: 'DELETE',
    }),

  previewCsvImport: (filename: string, csvText: string) =>
    apiFetch<CsvPreviewResult>('/imports/preview', {
      method: 'POST',
      body: JSON.stringify({ filename, csvText }),
    }),

  confirmCsvImport: (batchId: string) =>
    apiFetch<{
      batchId: string;
      filename: string;
      totalRows: number;
      validRows: number;
      invalidRows: number;
      duplicateRows: number;
      importedRows: number;
      alreadyConfirmed: boolean;
    }>('/imports/confirm', {
      method: 'POST',
      body: JSON.stringify({ batchId }),
    }),

  loadDemoDataset: () =>
    apiFetch<{ loaded: number; label: string; message: string }>('/demo/load', {
      method: 'POST',
    }),

  clearDemoDataset: () =>
    apiFetch<{ removed: number }>('/demo/clear', {
      method: 'DELETE',
    }),

  getOverview: () => apiFetch<OverviewMetrics>('/analytics/overview'),

  getSpending: () =>
    apiFetch<{ categories: CategorySpendSummary[]; merchants: MerchantSummary[] }>(
      '/analytics/spending'
    ),

  getTrends: () => apiFetch<{ trends: MonthlyTrendPoint[] }>('/analytics/trends'),

  getRecurring: () => apiFetch<{ recurring: RecurringCandidate[] }>('/analytics/recurring'),

  getForecasts: () => apiFetch<ForecastOutput>('/forecasts'),

  generateForecasts: (horizonMonths = 3) =>
    apiFetch<ForecastOutput>('/forecasts/generate', {
      method: 'POST',
      body: JSON.stringify({ horizonMonths }),
    }),

  getAnomalies: () => apiFetch<{ alerts: AnomalyAlert[] }>('/anomalies'),

  analyzeAnomalies: () =>
    apiFetch<{ alerts: AnomalyAlert[]; analyzedAt: string }>('/anomalies/analyze', {
      method: 'POST',
    }),

  runSimulation: (input: SimulationInput) =>
    apiFetch<SimulationOutput>('/simulations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getGoals: () => apiFetch<{ goals: FinancialGoalItem[] }>('/goals'),

  createGoal: (payload: {
    title: string;
    targetAmount: number;
    currentAmount?: number;
    targetDate?: string | null;
  }) =>
    apiFetch<FinancialGoalItem>('/goals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getReminders: () =>
    apiFetch<{ reminders: PaymentReminderRecord[]; summary: ReminderSummary }>('/reminders'),

  createReminder: (payload: {
    title: string;
    reminderType: ReminderType;
    merchant?: string | null;
    categoryName?: string;
    amount: number;
    dueDate: string;
    recurrence: ReminderRecurrence;
    remindDaysBefore?: number;
    notes?: string | null;
  }) =>
    apiFetch<PaymentReminderRecord>('/reminders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateReminder: (
    id: string,
    payload: {
      title?: string;
      reminderType?: ReminderType;
      merchant?: string | null;
      categoryName?: string;
      amount?: number;
      dueDate?: string;
      recurrence?: ReminderRecurrence;
      remindDaysBefore?: number;
      status?: ReminderStatus;
      notes?: string | null;
    }
  ) =>
    apiFetch<PaymentReminderRecord>(`/reminders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  markReminderPaid: (id: string) =>
    apiFetch<{ reminder: PaymentReminderRecord; advancedToNextCycle: boolean }>(
      `/reminders/${id}/mark-paid`,
      { method: 'POST' }
    ),

  importRecurringReminders: () =>
    apiFetch<{
      importedCount: number;
      reminders: PaymentReminderRecord[];
      summary: ReminderSummary;
    }>('/reminders/import-recurring', { method: 'POST' }),

  deleteReminder: (id: string) =>
    apiFetch<{ deleted: boolean; id: string }>(`/reminders/${id}`, {
      method: 'DELETE',
    }),

  getIntegrations: () =>
    apiFetch<{
      providers: Array<{
        providerId: string;
        providerName: string;
        status: string;
        message: string;
        capabilities: string[];
      }>;
    }>('/integrations'),

  sendCopilotMessage: (question: string, sessionId?: string) =>
    apiFetch<CopilotResponsePayload>('/copilot/chat', {
      method: 'POST',
      body: JSON.stringify({ question, sessionId }),
    }),

  listCopilotSessions: () =>
    apiFetch<{ sessions: ChatSessionSummary[] }>('/copilot/sessions'),

  getCopilotSession: (sessionId: string) =>
    apiFetch<{ session: ChatSessionSummary; messages: ChatMessageItem[] }>(
      `/copilot/sessions/${sessionId}`
    ),
};
