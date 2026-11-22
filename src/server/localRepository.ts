import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyTransaction } from '../core/categorization.ts';
import { buildDedupeHash } from '../core/csvParser.ts';
import { DEMO_INDIAN_TRANSACTIONS, DEMO_OPENING_BALANCE_INR } from '../core/demoData.ts';
import { buildDemoReminders, computeNextRecurrenceDate } from '../core/reminders.ts';
import type {
  AnomalyAlert,
  CategoryRecord,
  CsvPreviewResult,
  ForecastOutput,
  PaymentReminderRecord,
  ReminderRecurrence,
  ReminderStatus,
  ReminderType,
  TransactionRecord,
  TransactionType,
} from '../core/types.ts';

interface LocalUser {
  uid: string;
  email: string;
  fullName: string | null;
  currency: string;
  openingBalance: number | null;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LocalImportBatch {
  id: string;
  userId: string;
  filename: string;
  status: 'PREVIEW' | 'CONFIRMED';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRows: number;
  previewPayload: CsvPreviewResult;
  createdAt: string;
  confirmedAt: string | null;
}

interface LocalGoal {
  id: string;
  userId: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  createdAt: string;
}

interface LocalChatSession {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface LocalChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  toolMetadata: unknown;
  createdAt: string;
}

interface LocalDatabaseState {
  users: LocalUser[];
  categories: CategoryRecord[];
  transactions: TransactionRecord[];
  importBatches: LocalImportBatch[];
  goals: LocalGoal[];
  chatSessions: LocalChatSession[];
  chatMessages: LocalChatMessage[];
  reminders: PaymentReminderRecord[];
  forecastsByUser: Record<string, ForecastOutput>;
  insightsByUser: Record<string, AnomalyAlert[]>;
}

const DEFAULT_SYSTEM_CATEGORIES: Array<{ name: string; type: 'EXPENSE' | 'INCOME' | 'TRANSFER' }> = [
  { name: 'Food', type: 'EXPENSE' },
  { name: 'Shopping', type: 'EXPENSE' },
  { name: 'Transport', type: 'EXPENSE' },
  { name: 'Housing', type: 'EXPENSE' },
  { name: 'Utilities', type: 'EXPENSE' },
  { name: 'Healthcare', type: 'EXPENSE' },
  { name: 'Education', type: 'EXPENSE' },
  { name: 'Entertainment', type: 'EXPENSE' },
  { name: 'Salary', type: 'INCOME' },
  { name: 'Freelance Income', type: 'INCOME' },
  { name: 'Transfers', type: 'TRANSFER' },
  { name: 'Other', type: 'EXPENSE' },
];

function getStorePath(): string {
  const baseDir = process.env.DATA_DIR || path.join(os.tmpdir(), 'finpilot-data');
  fs.mkdirSync(baseDir, { recursive: true });
  return path.join(baseDir, 'finpilot-store.json');
}

function emptyState(): LocalDatabaseState {
  return {
    users: [],
    categories: DEFAULT_SYSTEM_CATEGORIES.map((c) => ({
      id: crypto.randomUUID(),
      userId: null,
      name: c.name,
      type: c.type,
      isSystem: true,
    })),
    transactions: [],
    importBatches: [],
    goals: [],
    chatSessions: [],
    chatMessages: [],
    reminders: [],
    forecastsByUser: {},
    insightsByUser: {},
  };
}

let cachedState: LocalDatabaseState | null = null;

function readState(): LocalDatabaseState {
  if (cachedState) return cachedState;
  const filePath = getStorePath();
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<LocalDatabaseState>;
      const base = emptyState();
      cachedState = {
        ...base,
        ...parsed,
        categories:
          parsed.categories && parsed.categories.length > 0 ? parsed.categories : base.categories,
      };
      return cachedState;
    } catch (error) {
      console.error('Failed to read DATA_DIR store, initializing fresh store:', error);
    }
  }
  cachedState = emptyState();
  writeState(cachedState);
  return cachedState;
}

function writeState(state: LocalDatabaseState): void {
  const filePath = getStorePath();
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

export const localRepo = {
  async getOrCreateUser(uid: string, email: string, fullName?: string) {
    const state = readState();
    const now = new Date();
    const existing = state.users.find((u) => u.uid === uid);
    if (existing) {
      existing.email = email;
      existing.updatedAt = now.toISOString();
      writeState(state);
      return {
        uid: existing.uid,
        email: existing.email,
        fullName: existing.fullName,
        currency: existing.currency,
        openingBalance: existing.openingBalance !== null ? existing.openingBalance.toFixed(2) : null,
        onboardingCompleted: existing.onboardingCompleted,
        createdAt: new Date(existing.createdAt),
        updatedAt: now,
      };
    }

    const created: LocalUser = {
      uid,
      email,
      fullName: fullName ?? null,
      currency: 'INR',
      openingBalance: null,
      onboardingCompleted: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    state.users.push(created);
    writeState(state);
    return {
      uid: created.uid,
      email: created.email,
      fullName: created.fullName,
      currency: created.currency,
      openingBalance: null,
      onboardingCompleted: created.onboardingCompleted,
      createdAt: now,
      updatedAt: now,
    };
  },

  async getUserProfile(uid: string) {
    const state = readState();
    const u = state.users.find((item) => item.uid === uid);
    if (!u) return null;
    return {
      uid: u.uid,
      email: u.email,
      fullName: u.fullName,
      currency: u.currency,
      openingBalance: u.openingBalance,
      onboardingCompleted: u.onboardingCompleted,
      createdAt: u.createdAt,
    };
  },

  async updateUserProfile(
    uid: string,
    updates: {
      fullName?: string | null;
      currency?: string;
      openingBalance?: number | null;
      onboardingCompleted?: boolean;
    }
  ) {
    const state = readState();
    const u = state.users.find((item) => item.uid === uid);
    if (!u) return null;
    if (updates.fullName !== undefined) u.fullName = updates.fullName;
    if (updates.currency !== undefined) u.currency = updates.currency;
    if (updates.openingBalance !== undefined) u.openingBalance = updates.openingBalance;
    if (updates.onboardingCompleted !== undefined) {
      u.onboardingCompleted = updates.onboardingCompleted;
    }
    u.updatedAt = new Date().toISOString();
    writeState(state);
    return {
      uid: u.uid,
      email: u.email,
      fullName: u.fullName,
      currency: u.currency,
      openingBalance: u.openingBalance,
      onboardingCompleted: u.onboardingCompleted,
      createdAt: u.createdAt,
    };
  },

  async ensureAndListCategories(uid: string): Promise<CategoryRecord[]> {
    const state = readState();
    if (state.categories.length === 0) {
      state.categories = emptyState().categories;
      writeState(state);
    }
    return state.categories.filter((c) => c.isSystem || c.userId === uid);
  },

  async getAllUserTransactions(uid: string): Promise<TransactionRecord[]> {
    const state = readState();
    return state.transactions
      .filter((t) => t.userId === uid)
      .sort((a, b) => {
        const d = b.transactionDate.localeCompare(a.transactionDate);
        return d !== 0 ? d : (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      });
  },

  async listTransactionsForExport(
    uid: string,
    filters: {
      search?: string;
      category?: string;
      type?: TransactionType;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<TransactionRecord[]> {
    return filterLocalTransactions(await localRepo.getAllUserTransactions(uid), filters).slice(0, 5000);
  },

  async listTransactionsFiltered(
    uid: string,
    filters: {
      search?: string;
      category?: string;
      type?: TransactionType;
      startDate?: string;
      endDate?: string;
      page?: number;
      pageSize?: number;
    }
  ) {
    const all = filterLocalTransactions(await localRepo.getAllUserTransactions(uid), filters);
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    const offset = (page - 1) * pageSize;
    return {
      items: all.slice(offset, offset + pageSize),
      total: all.length,
      page,
      pageSize,
    };
  },

  async getTransactionById(uid: string, id: string): Promise<TransactionRecord | null> {
    const state = readState();
    return state.transactions.find((t) => t.id === id && t.userId === uid) ?? null;
  },

  async createManualTransaction(
    uid: string,
    input: {
      description: string;
      merchant?: string | null;
      amount: number;
      transactionType: TransactionType;
      transactionDate: string;
      categoryName?: string;
      isRecurring?: boolean;
    }
  ): Promise<TransactionRecord> {
    const state = readState();
    const cats = await localRepo.ensureAndListCategories(uid);
    const autoCls = classifyTransaction(input.description, input.transactionType, input.merchant);
    const chosenCategory = input.categoryName?.trim() || autoCls.category;
    const catRecord = cats.find((c) => c.name.toLowerCase() === chosenCategory.toLowerCase());
    const method = input.categoryName ? 'user_override' : autoCls.method;
    const confidence = input.categoryName ? 1 : autoCls.confidence;
    const dedupeHash = buildDedupeHash(
      input.transactionDate,
      input.amount,
      input.transactionType,
      `${input.description}-${Date.now()}-${Math.random()}`
    );

    const record: TransactionRecord = {
      id: crypto.randomUUID(),
      userId: uid,
      description: input.description.trim(),
      merchant: input.merchant?.trim() || autoCls.normalizedMerchant,
      amount: Number(input.amount.toFixed(2)),
      transactionType: input.transactionType,
      categoryId: catRecord?.id ?? null,
      categoryName: catRecord?.name ?? chosenCategory,
      subcategory: autoCls.subcategory,
      transactionDate: input.transactionDate,
      source: 'MANUAL',
      externalReference: null,
      dedupeHash,
      isRecurring: input.isRecurring ?? false,
      classificationConfidence: Number(confidence.toFixed(3)),
      classificationMethod: method,
      createdAt: new Date().toISOString(),
    };

    state.transactions.push(record);
    writeState(state);
    return record;
  },

  async updateTransaction(
    uid: string,
    id: string,
    updates: {
      categoryName?: string;
      description?: string;
      merchant?: string;
      amount?: number;
      transactionDate?: string;
      isRecurring?: boolean;
    }
  ): Promise<TransactionRecord | null> {
    const state = readState();
    const tx = state.transactions.find((t) => t.id === id && t.userId === uid);
    if (!tx) return null;

    if (updates.categoryName) {
      const cats = await localRepo.ensureAndListCategories(uid);
      const catRecord = cats.find(
        (c) => c.name.toLowerCase() === updates.categoryName!.toLowerCase()
      );
      tx.categoryName = catRecord?.name ?? updates.categoryName;
      tx.categoryId = catRecord?.id ?? null;
      tx.classificationMethod = 'user_override';
      tx.classificationConfidence = 1;
    }
    if (updates.description !== undefined) tx.description = updates.description.trim();
    if (updates.merchant !== undefined) tx.merchant = updates.merchant.trim();
    if (updates.amount !== undefined) tx.amount = Number(updates.amount.toFixed(2));
    if (updates.transactionDate !== undefined) tx.transactionDate = updates.transactionDate;
    if (updates.isRecurring !== undefined) tx.isRecurring = updates.isRecurring;

    writeState(state);
    return tx;
  },

  async deleteTransaction(uid: string, id: string): Promise<boolean> {
    const state = readState();
    const idx = state.transactions.findIndex((t) => t.id === id && t.userId === uid);
    if (idx === -1) return false;
    state.transactions.splice(idx, 1);
    writeState(state);
    return true;
  },

  async getUserExistingDedupeHashes(uid: string): Promise<Set<string>> {
    const state = readState();
    const set = new Set<string>();
    for (const t of state.transactions) {
      if (t.userId === uid && t.dedupeHash) set.add(t.dedupeHash);
    }
    return set;
  },

  async saveImportPreviewBatch(uid: string, preview: CsvPreviewResult): Promise<string> {
    const state = readState();
    const id = crypto.randomUUID();
    state.importBatches.push({
      id,
      userId: uid,
      filename: preview.filename,
      status: 'PREVIEW',
      totalRows: preview.totalRows,
      validRows: preview.validRows,
      invalidRows: preview.invalidRows,
      duplicateRows: preview.duplicateRows,
      importedRows: 0,
      previewPayload: preview,
      createdAt: new Date().toISOString(),
      confirmedAt: null,
    });
    writeState(state);
    return id;
  },

  async confirmImportBatch(uid: string, batchId: string) {
    const state = readState();
    const batch = state.importBatches.find((b) => b.id === batchId && b.userId === uid);
    if (!batch) return null;

    if (batch.status === 'CONFIRMED') {
      return {
        batchId: batch.id,
        filename: batch.filename,
        totalRows: batch.totalRows,
        validRows: batch.validRows,
        invalidRows: batch.invalidRows,
        duplicateRows: batch.duplicateRows,
        importedRows: batch.importedRows,
        alreadyConfirmed: true,
      };
    }

    const cats = await localRepo.ensureAndListCategories(uid);
    const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
    const existingHashes = await localRepo.getUserExistingDedupeHashes(uid);

    const rowsToInsert = batch.previewPayload.rows.filter(
      (r) => !r.isDuplicate && !existingHashes.has(r.dedupeHash)
    );

    const nowIso = new Date().toISOString();
    let importedCount = 0;
    for (const r of rowsToInsert) {
      if (existingHashes.has(r.dedupeHash)) continue;
      existingHashes.add(r.dedupeHash);
      const cat = catByName.get(r.category.toLowerCase());
      state.transactions.push({
        id: crypto.randomUUID(),
        userId: uid,
        description: r.description,
        merchant: r.merchant,
        amount: Number(r.amount.toFixed(2)),
        transactionType: r.transactionType,
        categoryId: cat?.id ?? null,
        categoryName: cat?.name ?? r.category,
        subcategory: r.subcategory,
        transactionDate: r.transactionDate,
        source: 'CSV',
        externalReference: null,
        dedupeHash: r.dedupeHash,
        isRecurring: false,
        classificationConfidence: Number(r.confidence.toFixed(3)),
        classificationMethod: r.method,
        createdAt: nowIso,
      });
      importedCount++;
    }

    batch.status = 'CONFIRMED';
    batch.importedRows = importedCount;
    batch.confirmedAt = nowIso;
    writeState(state);

    return {
      batchId: batch.id,
      filename: batch.filename,
      totalRows: batch.totalRows,
      validRows: batch.validRows,
      invalidRows: batch.invalidRows,
      duplicateRows: batch.totalRows - batch.invalidRows - importedCount,
      importedRows: importedCount,
      alreadyConfirmed: false,
    };
  },

  async listImportBatches(uid: string) {
    const state = readState();
    return state.importBatches
      .filter((b) => b.userId === uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map((b) => ({
        id: b.id,
        filename: b.filename,
        status: b.status,
        totalRows: b.totalRows,
        validRows: b.validRows,
        invalidRows: b.invalidRows,
        duplicateRows: b.duplicateRows,
        importedRows: b.importedRows,
        createdAt: b.createdAt,
        confirmedAt: b.confirmedAt,
      }));
  },

  async loadDemoDatasetForUser(uid: string) {
    const state = readState();
    const cats = await localRepo.ensureAndListCategories(uid);
    const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
    const existingDemo = state.transactions.filter(
      (t) => t.userId === uid && t.source === 'DEMO'
    );

    if (existingDemo.length === 0) {
      const existingHashes = await localRepo.getUserExistingDedupeHashes(uid);
      const nowIso = new Date().toISOString();
      for (const row of DEMO_INDIAN_TRANSACTIONS) {
        const cls = classifyTransaction(row.description, row.transactionType, row.merchant);
        const cat = catByName.get(cls.category.toLowerCase());
        const dedupeHash = buildDedupeHash(
          row.transactionDate,
          row.amount,
          row.transactionType,
          `${row.description}|demo|${row.merchant}`
        );
        if (existingHashes.has(dedupeHash)) continue;
        existingHashes.add(dedupeHash);
        state.transactions.push({
          id: crypto.randomUUID(),
          userId: uid,
          description: row.description,
          merchant: row.merchant,
          amount: Number(row.amount.toFixed(2)),
          transactionType: row.transactionType,
          categoryId: cat?.id ?? null,
          categoryName: cat?.name ?? cls.category,
          subcategory: cls.subcategory,
          transactionDate: row.transactionDate,
          source: 'DEMO',
          externalReference: null,
          dedupeHash,
          isRecurring: /rent|netflix|airtel|bescom|salary/i.test(row.description),
          classificationConfidence: Number(cls.confidence.toFixed(3)),
          classificationMethod: cls.method,
          createdAt: nowIso,
        });
      }
      writeState(state);
    }

    const profile = await localRepo.getUserProfile(uid);
    if (profile && (profile.openingBalance === null || !profile.onboardingCompleted)) {
      await localRepo.updateUserProfile(uid, {
        currency: 'INR',
        openingBalance: profile.openingBalance ?? DEMO_OPENING_BALANCE_INR,
        onboardingCompleted: true,
      });
    }

    return { loaded: DEMO_INDIAN_TRANSACTIONS.length };
  },

  async clearDemoDatasetForUser(uid: string) {
    const state = readState();
    const before = state.transactions.length;
    state.transactions = state.transactions.filter(
      (t) => !(t.userId === uid && t.source === 'DEMO')
    );
    const removed = before - state.transactions.length;
    writeState(state);
    return { removed };
  },

  async saveForecastSnapshots(uid: string, forecast: ForecastOutput) {
    const state = readState();
    state.forecastsByUser[uid] = forecast;
    writeState(state);
  },

  async saveInsightsSnapshots(uid: string, alerts: AnomalyAlert[]) {
    const state = readState();
    state.insightsByUser[uid] = alerts;
    writeState(state);
  },

  async listGoals(uid: string) {
    const state = readState();
    return state.goals
      .filter((g) => g.userId === uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((g) => ({
        id: g.id,
        title: g.title,
        targetAmount: g.targetAmount,
        currentAmount: g.currentAmount,
        targetDate: g.targetDate,
        createdAt: g.createdAt,
      }));
  },

  async createGoal(
    uid: string,
    input: { title: string; targetAmount: number; currentAmount?: number; targetDate?: string | null }
  ) {
    const state = readState();
    const g: LocalGoal = {
      id: crypto.randomUUID(),
      userId: uid,
      title: input.title.trim(),
      targetAmount: Number(input.targetAmount.toFixed(2)),
      currentAmount: Number((input.currentAmount ?? 0).toFixed(2)),
      targetDate: input.targetDate ?? null,
      createdAt: new Date().toISOString(),
    };
    state.goals.push(g);
    writeState(state);
    return {
      id: g.id,
      title: g.title,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      targetDate: g.targetDate,
      createdAt: g.createdAt,
    };
  },

  async listChatSessions(uid: string) {
    const state = readState();
    return state.chatSessions
      .filter((s) => s.userId === uid)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 20)
      .map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
  },

  async getChatSessionWithMessages(uid: string, sessionId: string) {
    const state = readState();
    const sess = state.chatSessions.find((s) => s.id === sessionId && s.userId === uid);
    if (!sess) return null;
    const msgs = state.chatMessages
      .filter((m) => m.sessionId === sessionId && m.userId === uid)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      session: {
        id: sess.id,
        title: sess.title,
        createdAt: sess.createdAt,
        updatedAt: sess.updatedAt,
      },
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolMetadata: m.toolMetadata,
        createdAt: m.createdAt,
      })),
    };
  },

  async createChatSession(uid: string, title: string): Promise<string> {
    const state = readState();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    state.chatSessions.push({
      id,
      userId: uid,
      title: title.slice(0, 80),
      createdAt: now,
      updatedAt: now,
    });
    writeState(state);
    return id;
  },

  async appendChatMessage(
    uid: string,
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    toolMetadata?: unknown
  ) {
    const state = readState();
    const now = new Date().toISOString();
    state.chatMessages.push({
      id: crypto.randomUUID(),
      sessionId,
      userId: uid,
      role,
      content,
      toolMetadata: toolMetadata ?? null,
      createdAt: now,
    });
    const sess = state.chatSessions.find((s) => s.id === sessionId && s.userId === uid);
    if (sess) sess.updatedAt = now;
    writeState(state);
  },

  async listPaymentReminders(uid: string): Promise<PaymentReminderRecord[]> {
    const state = readState();
    return state.reminders
      .filter((r) => r.userId === uid)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  },

  async seedDemoRemindersIfEmpty(uid: string): Promise<void> {
    const state = readState();
    if (state.reminders.some((r) => r.userId === uid)) return;
    const nowIso = new Date().toISOString();
    for (const item of buildDemoReminders()) {
      state.reminders.push({
        id: crypto.randomUUID(),
        userId: uid,
        title: item.title,
        reminderType: item.reminderType,
        merchant: item.merchant,
        categoryName: item.categoryName,
        amount: Number(item.amount.toFixed(2)),
        dueDate: item.dueDate,
        recurrence: item.recurrence,
        remindDaysBefore: item.remindDaysBefore,
        status: 'PENDING',
        notes: item.notes,
        lastPaidAt: null,
        createdAt: nowIso,
      });
    }
    writeState(state);
  },

  async createPaymentReminder(
    uid: string,
    input: {
      title: string;
      reminderType: ReminderType;
      merchant?: string | null;
      categoryName?: string;
      amount: number;
      dueDate: string;
      recurrence: ReminderRecurrence;
      remindDaysBefore?: number;
      notes?: string | null;
    }
  ): Promise<PaymentReminderRecord> {
    const state = readState();
    const record: PaymentReminderRecord = {
      id: crypto.randomUUID(),
      userId: uid,
      title: input.title.trim(),
      reminderType: input.reminderType,
      merchant: input.merchant?.trim() || null,
      categoryName: input.categoryName?.trim() || 'Other',
      amount: Number(input.amount.toFixed(2)),
      dueDate: input.dueDate,
      recurrence: input.recurrence,
      remindDaysBefore: input.remindDaysBefore ?? 3,
      status: 'PENDING',
      notes: input.notes?.trim() || null,
      lastPaidAt: null,
      createdAt: new Date().toISOString(),
    };
    state.reminders.push(record);
    writeState(state);
    return record;
  },

  async updatePaymentReminder(
    uid: string,
    id: string,
    updates: {
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
  ): Promise<PaymentReminderRecord | null> {
    const state = readState();
    const r = state.reminders.find((item) => item.id === id && item.userId === uid);
    if (!r) return null;
    if (updates.title !== undefined) r.title = updates.title.trim();
    if (updates.reminderType !== undefined) r.reminderType = updates.reminderType;
    if (updates.merchant !== undefined) r.merchant = updates.merchant?.trim() || null;
    if (updates.categoryName !== undefined) r.categoryName = updates.categoryName;
    if (updates.amount !== undefined) r.amount = Number(updates.amount.toFixed(2));
    if (updates.dueDate !== undefined) r.dueDate = updates.dueDate;
    if (updates.recurrence !== undefined) r.recurrence = updates.recurrence;
    if (updates.remindDaysBefore !== undefined) r.remindDaysBefore = updates.remindDaysBefore;
    if (updates.status !== undefined) r.status = updates.status;
    if (updates.notes !== undefined) r.notes = updates.notes?.trim() || null;
    writeState(state);
    return r;
  },

  async markPaymentReminderPaid(
    uid: string,
    id: string
  ): Promise<{ reminder: PaymentReminderRecord; advancedToNextCycle: boolean } | null> {
    const state = readState();
    const r = state.reminders.find((item) => item.id === id && item.userId === uid);
    if (!r) return null;

    const nowIso = new Date().toISOString();
    r.lastPaidAt = nowIso;

    if (r.recurrence === 'ONCE') {
      r.status = 'PAID';
      writeState(state);
      return { reminder: r, advancedToNextCycle: false };
    }

    r.dueDate = computeNextRecurrenceDate(r.dueDate, r.recurrence);
    r.status = 'PENDING';
    writeState(state);
    return { reminder: r, advancedToNextCycle: true };
  },

  async deletePaymentReminder(uid: string, id: string): Promise<boolean> {
    const state = readState();
    const idx = state.reminders.findIndex((item) => item.id === id && item.userId === uid);
    if (idx === -1) return false;
    state.reminders.splice(idx, 1);
    writeState(state);
    return true;
  },
};

function filterLocalTransactions(
  rows: TransactionRecord[],
  filters: {
    search?: string;
    category?: string;
    type?: TransactionType;
    startDate?: string;
    endDate?: string;
  }
): TransactionRecord[] {
  const q = filters.search?.trim().toLowerCase() || '';
  return rows.filter((t) => {
    if (filters.type && t.transactionType !== filters.type) return false;
    if (filters.category && filters.category !== 'ALL' && t.categoryName !== filters.category) {
      return false;
    }
    if (filters.startDate && t.transactionDate < filters.startDate) return false;
    if (filters.endDate && t.transactionDate > filters.endDate) return false;
    if (q) {
      const matchDesc = t.description.toLowerCase().includes(q);
      const matchMerchant = (t.merchant ?? '').toLowerCase().includes(q);
      const matchCat = t.categoryName.toLowerCase().includes(q);
      if (!matchDesc && !matchMerchant && !matchCat) return false;
    }
    return true;
  });
}
