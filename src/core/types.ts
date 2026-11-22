export type TransactionType = 'CREDIT' | 'DEBIT';
export type TransactionSource = 'CSV' | 'MANUAL' | 'AUTHORIZED_INTEGRATION' | 'DEMO';
export type ClassificationMethod =
  | 'merchant_rule'
  | 'ml_naive_bayes'
  | 'credit_income_rule'
  | 'user_override'
  | 'fallback';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface CategoryRecord {
  id: string;
  userId: string | null;
  name: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  isSystem: boolean;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  description: string;
  merchant: string | null;
  amount: number;
  transactionType: TransactionType;
  categoryId: string | null;
  categoryName: string;
  subcategory: string | null;
  transactionDate: string; // YYYY-MM-DD
  source: TransactionSource;
  externalReference: string | null;
  dedupeHash: string | null;
  isRecurring: boolean;
  classificationConfidence: number | null;
  classificationMethod: string | null;
  createdAt?: string;
}

export interface ClassificationResult {
  category: string;
  subcategory: string | null;
  confidence: number;
  method: ClassificationMethod;
  normalizedMerchant: string;
}

export interface ParsedCsvRow {
  rowNumber: number;
  transactionDate: string;
  description: string;
  merchant: string;
  amount: number;
  transactionType: TransactionType;
  category: string;
  subcategory: string | null;
  confidence: number;
  method: ClassificationMethod;
  dedupeHash: string;
  isDuplicate: boolean;
}

export interface InvalidCsvRow {
  rowNumber: number;
  raw: Record<string, string>;
  reason: string;
}

export interface CsvPreviewResult {
  batchId?: string;
  filename: string;
  detectedColumns: {
    dateColumn: string | null;
    descriptionColumn: string | null;
    amountColumn: string | null;
    debitColumn: string | null;
    creditColumn: string | null;
    typeColumn: string | null;
    merchantColumn: string | null;
  };
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: ParsedCsvRow[];
  invalidRowDetails: InvalidCsvRow[];
}

export interface CategorySpendSummary {
  category: string;
  total: number;
  count: number;
  sharePercent: number;
}

export interface MonthlyTrendPoint {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  netCashFlow: number;
  savingsRatePercent: number | null;
  transactionCount: number;
}

export interface MerchantSummary {
  merchant: string;
  total: number;
  count: number;
  avgAmount: number;
  primaryCategory: string;
}

export interface RecurringCandidate {
  merchant: string;
  category: string;
  averageAmount: number;
  occurrences: number;
  cadenceDays: number;
  lastDate: string;
  nextEstimatedDate: string;
}

export interface OverviewMetrics {
  currency: string;
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  currentMonthIncome: number;
  currentMonthExpenses: number;
  currentMonthSavings: number;
  savingsRatePercent: number | null;
  recordedBalance: number | null;
  hasOpeningBalance: boolean;
  monthOverMonthExpenseChangePercent: number | null;
  monthOverMonthIncomeChangePercent: number | null;
  latestMonth: string | null;
  previousMonth: string | null;
  transactionCount: number;
  dateRange: { start: string | null; end: string | null };
  spendingByCategory: CategorySpendSummary[];
  hasDemoData: boolean;
}

export interface ForecastPoint {
  month: string; // YYYY-MM
  projectedIncome: number;
  projectedExpenses: number;
  projectedNetCashFlow: number;
  projectedBalance: number | null;
  lowerExpenseEstimate: number;
  upperExpenseEstimate: number;
  lowerNetEstimate: number;
  upperNetEstimate: number;
}

export interface ForecastOutput {
  status: 'ready' | 'insufficient_data';
  reason: string | null;
  modelVersion: string;
  generatedAt: string;
  observedMonths: number;
  minimumRequiredMonths: number;
  recurringMonthlyCommitments: number;
  recurringMonthlyIncome: number;
  points: ForecastPoint[];
  evaluation: {
    holdoutMonth: string | null;
    actualExpenses: number | null;
    predictedExpenses: number | null;
    mapePercent: number | null;
  } | null;
}

export interface AnomalyAlert {
  id: string;
  transactionId: string | null;
  label: 'Unusual activity' | 'Spending spike' | 'Possible duplicate' | 'Needs review';
  title: string;
  description: string;
  severity: Severity;
  detectionReason: string;
  historicalBaseline: string;
  evidence: {
    amount?: number;
    baselineMedian?: number;
    baselineIqr?: number;
    category?: string;
    merchant?: string;
    transactionDate?: string;
    multiplier?: number;
  };
}

export interface SimulationInput {
  expenseAdjustmentPercent?: number; // e.g. -15 means reduce expenses by 15%
  targetCategory?: string;
  categoryAdjustmentPercent?: number;
  additionalMonthlyExpense?: number;
  additionalMonthlyIncome?: number;
  savingsContributionGoal?: number;
}

export interface SimulationOutput {
  dataBasis: 'historical_monthly_average' | 'latest_complete_month' | 'no_transactions';
  baselineMonthLabel: string | null;
  historicalBaseline: {
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlySavings: number;
    savingsRatePercent: number | null;
    targetCategorySpend: number | null;
  };
  hypotheticalAdjustments: SimulationInput;
  simulatedOutcome: {
    projectedMonthlyIncome: number;
    projectedMonthlyExpenses: number;
    projectedMonthlySavings: number;
    monthlySavingsDelta: number;
    annualSavingsDelta: number;
    projectedSavingsRatePercent: number | null;
    meetsSavingsGoal: boolean | null;
  };
  notes: string[];
}

export interface CopilotEvidenceItem {
  metric: string;
  value: number | string;
  currency?: string;
  detail?: string;
}

export interface CopilotResponsePayload {
  sessionId: string;
  answer: string;
  intent: string;
  tools_used: string[];
  evidence: CopilotEvidenceItem[];
  limitations: string[];
  generated_at: string;
  fallback_used: boolean;
}

export type ReminderType = 'EMI' | 'BILL' | 'EXPENSE' | 'SUBSCRIPTION' | 'TAX';
export type ReminderRecurrence = 'ONCE' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type ReminderStatus = 'PENDING' | 'PAID' | 'DISMISSED';
export type ReminderUrgency =
  | 'OVERDUE'
  | 'DUE_TODAY'
  | 'DUE_SOON'
  | 'UPCOMING'
  | 'PAID'
  | 'DISMISSED';

export interface PaymentReminderRecord {
  id: string;
  userId: string;
  title: string;
  reminderType: ReminderType;
  merchant: string | null;
  categoryName: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  recurrence: ReminderRecurrence;
  remindDaysBefore: number;
  status: ReminderStatus;
  notes: string | null;
  lastPaidAt: string | null;
  createdAt?: string;
  urgency?: ReminderUrgency;
  daysUntilDue?: number | null;
}

export interface ReminderSummary {
  overdueCount: number;
  dueTodayCount: number;
  dueSoonCount: number;
  activeAlertCount: number;
  totalPendingCount: number;
  totalPendingAmount: number;
  urgentReminders: PaymentReminderRecord[];
}

