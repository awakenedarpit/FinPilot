import { and, desc, eq, gte, ilike, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { localRepo } from './localRepository.ts';
import {
  categories,
  chatMessages,
  chatSessions,
  financialGoals,
  forecasts,
  importBatches,
  insights,
  paymentReminders,
  transactions,
  users,
} from '../db/schema.ts';
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
  TransactionSource,
  TransactionType,
} from '../core/types.ts';

function usePostgres(): boolean {
  return Boolean(process.env.SQL_HOST);
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

export async function getOrCreateUser(uid: string, email: string, fullName?: string) {
  if (!usePostgres()) return localRepo.getOrCreateUser(uid, email, fullName);
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        fullName: fullName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Failed to upsert user:', error);
    throw new Error('Database error while synchronizing user profile.', { cause: error });
  }
}

export async function getUserProfile(uid: string) {
  if (!usePostgres()) return localRepo.getUserProfile(uid);
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (rows.length === 0) return null;
    const u = rows[0];
    return {
      uid: u.uid,
      email: u.email,
      fullName: u.fullName,
      currency: u.currency,
      openingBalance: u.openingBalance !== null ? Number(u.openingBalance) : null,
      onboardingCompleted: u.onboardingCompleted,
      createdAt: u.createdAt.toISOString(),
    };
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    throw new Error('Database error while fetching profile.', { cause: error });
  }
}

export async function updateUserProfile(
  uid: string,
  updates: {
    fullName?: string | null;
    currency?: string;
    openingBalance?: number | null;
    onboardingCompleted?: boolean;
  }
) {
  if (!usePostgres()) return localRepo.updateUserProfile(uid, updates);
  try {
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.fullName !== undefined) setData.fullName = updates.fullName;
    if (updates.currency !== undefined) setData.currency = updates.currency;
    if (updates.openingBalance !== undefined) {
      setData.openingBalance =
        updates.openingBalance === null ? null : updates.openingBalance.toFixed(2);
    }
    if (updates.onboardingCompleted !== undefined) {
      setData.onboardingCompleted = updates.onboardingCompleted;
    }

    const updated = await db
      .update(users)
      .set(setData)
      .where(eq(users.uid, uid))
      .returning();
    if (updated.length === 0) return null;
    const u = updated[0];
    return {
      uid: u.uid,
      email: u.email,
      fullName: u.fullName,
      currency: u.currency,
      openingBalance: u.openingBalance !== null ? Number(u.openingBalance) : null,
      onboardingCompleted: u.onboardingCompleted,
      createdAt: u.createdAt.toISOString(),
    };
  } catch (error) {
    console.error('Failed to update user profile:', error);
    throw new Error('Database error while updating profile.', { cause: error });
  }
}

export async function ensureAndListCategories(uid: string): Promise<CategoryRecord[]> {
  if (!usePostgres()) return localRepo.ensureAndListCategories(uid);
  try {
    const existing = await db
      .select()
      .from(categories)
      .where(or(eq(categories.isSystem, true), eq(categories.userId, uid)));

    if (existing.length === 0) {
      await db.insert(categories).values(
        DEFAULT_SYSTEM_CATEGORIES.map((c) => ({
          name: c.name,
          type: c.type,
          isSystem: true,
          userId: null,
        }))
      );
      const seeded = await db
        .select()
        .from(categories)
        .where(or(eq(categories.isSystem, true), eq(categories.userId, uid)));
      return seeded.map((c) => ({
        id: c.id,
        userId: c.userId,
        name: c.name,
        type: c.type as CategoryRecord['type'],
        isSystem: c.isSystem,
      }));
    }

    return existing.map((c) => ({
      id: c.id,
      userId: c.userId,
      name: c.name,
      type: c.type as CategoryRecord['type'],
      isSystem: c.isSystem,
    }));
  } catch (error) {
    console.error('Failed to list categories:', error);
    throw new Error('Database error while loading categories.', { cause: error });
  }
}

function mapTransactionRow(row: typeof transactions.$inferSelect): TransactionRecord {
  return {
    id: row.id,
    userId: row.userId,
    description: row.description,
    merchant: row.merchant,
    amount: Number(row.amount),
    transactionType: row.transactionType as TransactionType,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    subcategory: row.subcategory,
    transactionDate: row.transactionDate,
    source: row.source as TransactionSource,
    externalReference: row.externalReference,
    dedupeHash: row.dedupeHash,
    isRecurring: row.isRecurring,
    classificationConfidence:
      row.classificationConfidence !== null ? Number(row.classificationConfidence) : null,
    classificationMethod: row.classificationMethod,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getAllUserTransactions(uid: string): Promise<TransactionRecord[]> {
  if (!usePostgres()) return localRepo.getAllUserTransactions(uid);
  try {
    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, uid))
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt));
    return rows.map(mapTransactionRow);
  } catch (error) {
    console.error('Failed to fetch all user transactions:', error);
    throw new Error('Database error while fetching transactions.', { cause: error });
  }
}

function buildTransactionWhereClause(
  uid: string,
  filters: {
    search?: string;
    category?: string;
    type?: TransactionType;
    startDate?: string;
    endDate?: string;
  }
) {
  const conditions = [eq(transactions.userId, uid)];
  if (filters.type) {
    conditions.push(eq(transactions.transactionType, filters.type));
  }
  if (filters.category && filters.category !== 'ALL') {
    conditions.push(eq(transactions.categoryName, filters.category));
  }
  if (filters.startDate) {
    conditions.push(gte(transactions.transactionDate, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(transactions.transactionDate, filters.endDate));
  }
  if (filters.search && filters.search.trim()) {
    const pattern = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(transactions.description, pattern),
        ilike(transactions.merchant, pattern),
        ilike(transactions.categoryName, pattern)
      )!
    );
  }
  return and(...conditions);
}

export async function listTransactionsForExport(
  uid: string,
  filters: {
    search?: string;
    category?: string;
    type?: TransactionType;
    startDate?: string;
    endDate?: string;
  }
): Promise<TransactionRecord[]> {
  if (!usePostgres()) return localRepo.listTransactionsForExport(uid, filters);
  try {
    const whereClause = buildTransactionWhereClause(uid, filters);
    const rows = await db
      .select()
      .from(transactions)
      .where(whereClause)
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
      .limit(5000);
    return rows.map(mapTransactionRow);
  } catch (error) {
    console.error('Failed to export transactions:', error);
    throw new Error('Database error while exporting transactions.', { cause: error });
  }
}

export async function listTransactionsFiltered(
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
  if (!usePostgres()) return localRepo.listTransactionsFiltered(uid, filters);
  try {
    const whereClause = buildTransactionWhereClause(uid, filters);
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
    const offset = (page - 1) * pageSize;

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(transactions)
      .where(whereClause);

    const rows = await db
      .select()
      .from(transactions)
      .where(whereClause)
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows.map(mapTransactionRow),
      total,
      page,
      pageSize,
    };
  } catch (error) {
    console.error('Failed to query filtered transactions:', error);
    throw new Error('Database error while searching transactions.', { cause: error });
  }
}

export async function getTransactionById(uid: string, id: string): Promise<TransactionRecord | null> {
  if (!usePostgres()) return localRepo.getTransactionById(uid, id);
  try {
    const rows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, uid)))
      .limit(1);
    return rows.length > 0 ? mapTransactionRow(rows[0]) : null;
  } catch (error) {
    console.error('Failed to fetch transaction by id:', error);
    throw new Error('Database error while fetching transaction.', { cause: error });
  }
}

export async function createManualTransaction(
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
  if (!usePostgres()) return localRepo.createManualTransaction(uid, input);
  try {
    const cats = await ensureAndListCategories(uid);
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

    const inserted = await db
      .insert(transactions)
      .values({
        userId: uid,
        description: input.description.trim(),
        merchant: input.merchant?.trim() || autoCls.normalizedMerchant,
        amount: input.amount.toFixed(2),
        transactionType: input.transactionType,
        categoryId: catRecord?.id ?? null,
        categoryName: catRecord?.name ?? chosenCategory,
        subcategory: autoCls.subcategory,
        transactionDate: input.transactionDate,
        source: 'MANUAL',
        dedupeHash,
        isRecurring: input.isRecurring ?? false,
        classificationConfidence: confidence.toFixed(3),
        classificationMethod: method,
      })
      .returning();

    return mapTransactionRow(inserted[0]);
  } catch (error) {
    console.error('Failed to create manual transaction:', error);
    throw new Error('Database error while creating transaction.', { cause: error });
  }
}

export async function updateTransaction(
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
  if (!usePostgres()) return localRepo.updateTransaction(uid, id, updates);
  try {
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.categoryName) {
      const cats = await ensureAndListCategories(uid);
      const catRecord = cats.find(
        (c) => c.name.toLowerCase() === updates.categoryName!.toLowerCase()
      );
      setData.categoryName = catRecord?.name ?? updates.categoryName;
      setData.categoryId = catRecord?.id ?? null;
      setData.classificationMethod = 'user_override';
      setData.classificationConfidence = '1.000';
    }
    if (updates.description !== undefined) setData.description = updates.description.trim();
    if (updates.merchant !== undefined) setData.merchant = updates.merchant.trim();
    if (updates.amount !== undefined) setData.amount = updates.amount.toFixed(2);
    if (updates.transactionDate !== undefined) setData.transactionDate = updates.transactionDate;
    if (updates.isRecurring !== undefined) setData.isRecurring = updates.isRecurring;

    const updated = await db
      .update(transactions)
      .set(setData)
      .where(and(eq(transactions.id, id), eq(transactions.userId, uid)))
      .returning();

    return updated.length > 0 ? mapTransactionRow(updated[0]) : null;
  } catch (error) {
    console.error('Failed to update transaction:', error);
    throw new Error('Database error while updating transaction.', { cause: error });
  }
}

export async function deleteTransaction(uid: string, id: string): Promise<boolean> {
  if (!usePostgres()) return localRepo.deleteTransaction(uid, id);
  try {
    const deleted = await db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, uid)))
      .returning({ id: transactions.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Failed to delete transaction:', error);
    throw new Error('Database error while deleting transaction.', { cause: error });
  }
}

export async function getUserExistingDedupeHashes(uid: string): Promise<Set<string>> {
  if (!usePostgres()) return localRepo.getUserExistingDedupeHashes(uid);
  try {
    const rows = await db
      .select({ dedupeHash: transactions.dedupeHash })
      .from(transactions)
      .where(eq(transactions.userId, uid));
    const set = new Set<string>();
    for (const r of rows) {
      if (r.dedupeHash) set.add(r.dedupeHash);
    }
    return set;
  } catch (error) {
    console.error('Failed to fetch dedupe hashes:', error);
    throw new Error('Database error while checking duplicate hashes.', { cause: error });
  }
}

export async function saveImportPreviewBatch(
  uid: string,
  preview: CsvPreviewResult
): Promise<string> {
  if (!usePostgres()) return localRepo.saveImportPreviewBatch(uid, preview);
  try {
    const inserted = await db
      .insert(importBatches)
      .values({
        userId: uid,
        filename: preview.filename,
        status: 'PREVIEW',
        totalRows: preview.totalRows,
        validRows: preview.validRows,
        invalidRows: preview.invalidRows,
        duplicateRows: preview.duplicateRows,
        importedRows: 0,
        previewPayload: preview,
      })
      .returning({ id: importBatches.id });
    return inserted[0].id;
  } catch (error) {
    console.error('Failed to save import preview batch:', error);
    throw new Error('Database error while saving CSV preview.', { cause: error });
  }
}

export async function confirmImportBatch(uid: string, batchId: string) {
  if (!usePostgres()) return localRepo.confirmImportBatch(uid, batchId);
  try {
    const batchRows = await db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, uid)))
      .limit(1);

    if (batchRows.length === 0) {
      return null;
    }

    const batch = batchRows[0];
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

    const preview = batch.previewPayload as CsvPreviewResult;
    const cats = await ensureAndListCategories(uid);
    const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
    const existingHashes = await getUserExistingDedupeHashes(uid);

    const rowsToInsert = preview.rows.filter(
      (r) => !r.isDuplicate && !existingHashes.has(r.dedupeHash)
    );

    let importedCount = 0;
    if (rowsToInsert.length > 0) {
      const values = rowsToInsert.map((r) => {
        const cat = catByName.get(r.category.toLowerCase());
        return {
          userId: uid,
          description: r.description,
          merchant: r.merchant,
          amount: r.amount.toFixed(2),
          transactionType: r.transactionType,
          categoryId: cat?.id ?? null,
          categoryName: cat?.name ?? r.category,
          subcategory: r.subcategory,
          transactionDate: r.transactionDate,
          source: 'CSV' as const,
          dedupeHash: r.dedupeHash,
          isRecurring: false,
          classificationConfidence: r.confidence.toFixed(3),
          classificationMethod: r.method,
        };
      });

      const inserted = await db
        .insert(transactions)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: transactions.id });
      importedCount = inserted.length;
    }

    await db
      .update(importBatches)
      .set({
        status: 'CONFIRMED',
        importedRows: importedCount,
        confirmedAt: new Date(),
      })
      .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, uid)));

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
  } catch (error) {
    console.error('Failed to confirm import batch:', error);
    throw new Error('Database error while confirming CSV import.', { cause: error });
  }
}

export async function listImportBatches(uid: string) {
  if (!usePostgres()) return localRepo.listImportBatches(uid);
  try {
    const rows = await db
      .select({
        id: importBatches.id,
        filename: importBatches.filename,
        status: importBatches.status,
        totalRows: importBatches.totalRows,
        validRows: importBatches.validRows,
        invalidRows: importBatches.invalidRows,
        duplicateRows: importBatches.duplicateRows,
        importedRows: importBatches.importedRows,
        createdAt: importBatches.createdAt,
        confirmedAt: importBatches.confirmedAt,
      })
      .from(importBatches)
      .where(eq(importBatches.userId, uid))
      .orderBy(desc(importBatches.createdAt))
      .limit(20);
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
    }));
  } catch (error) {
    console.error('Failed to list import batches:', error);
    throw new Error('Database error while fetching import history.', { cause: error });
  }
}

export async function loadDemoDatasetForUser(uid: string) {
  if (!usePostgres()) return localRepo.loadDemoDatasetForUser(uid);
  try {
    const cats = await ensureAndListCategories(uid);
    const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));

    // Check existing demo count
    const existingDemo = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.userId, uid), eq(transactions.source, 'DEMO')));

    if (existingDemo.length === 0) {
      const values = DEMO_INDIAN_TRANSACTIONS.map((row) => {
        const cls = classifyTransaction(row.description, row.transactionType, row.merchant);
        const cat = catByName.get(cls.category.toLowerCase());
        const dedupeHash = buildDedupeHash(
          row.transactionDate,
          row.amount,
          row.transactionType,
          `${row.description}|demo|${row.merchant}`
        );
        return {
          userId: uid,
          description: row.description,
          merchant: row.merchant,
          amount: row.amount.toFixed(2),
          transactionType: row.transactionType,
          categoryId: cat?.id ?? null,
          categoryName: cat?.name ?? cls.category,
          subcategory: cls.subcategory,
          transactionDate: row.transactionDate,
          source: 'DEMO' as const,
          dedupeHash,
          isRecurring:
            /rent|netflix|airtel|bescom|salary/i.test(row.description),
          classificationConfidence: cls.confidence.toFixed(3),
          classificationMethod: cls.method,
        };
      });

      await db.insert(transactions).values(values).onConflictDoNothing();
    }

    // Ensure profile reflects INR and demo opening balance if unset
    const profile = await getUserProfile(uid);
    if (profile && (profile.openingBalance === null || !profile.onboardingCompleted)) {
      await updateUserProfile(uid, {
        currency: 'INR',
        openingBalance: profile.openingBalance ?? DEMO_OPENING_BALANCE_INR,
        onboardingCompleted: true,
      });
    }

    return { loaded: DEMO_INDIAN_TRANSACTIONS.length };
  } catch (error) {
    console.error('Failed to load demo dataset:', error);
    throw new Error('Database error while loading synthetic demo dataset.', { cause: error });
  }
}

export async function clearDemoDatasetForUser(uid: string) {
  if (!usePostgres()) return localRepo.clearDemoDatasetForUser(uid);
  try {
    const deleted = await db
      .delete(transactions)
      .where(and(eq(transactions.userId, uid), eq(transactions.source, 'DEMO')))
      .returning({ id: transactions.id });
    return { removed: deleted.length };
  } catch (error) {
    console.error('Failed to clear demo dataset:', error);
    throw new Error('Database error while clearing demo dataset.', { cause: error });
  }
}

export async function saveForecastSnapshots(uid: string, forecast: ForecastOutput) {
  if (!usePostgres()) return localRepo.saveForecastSnapshots(uid, forecast);
  try {
    await db.delete(forecasts).where(eq(forecasts.userId, uid));
    if (forecast.status !== 'ready' || forecast.points.length === 0) return;

    await db.insert(forecasts).values(
      forecast.points.map((pt) => ({
        userId: uid,
        forecastDate: `${pt.month}-01`,
        projectedIncome: pt.projectedIncome.toFixed(2),
        projectedExpenses: pt.projectedExpenses.toFixed(2),
        projectedBalance: pt.projectedBalance !== null ? pt.projectedBalance.toFixed(2) : null,
        lowerEstimate: pt.lowerExpenseEstimate.toFixed(2),
        upperEstimate: pt.upperExpenseEstimate.toFixed(2),
        modelVersion: forecast.modelVersion,
        metadata: { evaluation: forecast.evaluation },
      }))
    );
  } catch (error) {
    console.error('Failed to persist forecast snapshots:', error);
  }
}

export async function saveInsightsSnapshots(uid: string, alerts: AnomalyAlert[]) {
  if (!usePostgres()) return localRepo.saveInsightsSnapshots(uid, alerts);
  try {
    await db.delete(insights).where(eq(insights.userId, uid));
    if (alerts.length === 0) return;

    await db.insert(insights).values(
      alerts.map((a) => ({
        userId: uid,
        transactionId: a.transactionId,
        insightType: a.label,
        title: a.title,
        description: a.description,
        severity: a.severity,
        evidence: a.evidence,
      }))
    );
  } catch (error) {
    console.error('Failed to persist insights snapshots:', error);
  }
}

export async function listGoals(uid: string) {
  if (!usePostgres()) return localRepo.listGoals(uid);
  try {
    const rows = await db
      .select()
      .from(financialGoals)
      .where(eq(financialGoals.userId, uid))
      .orderBy(desc(financialGoals.createdAt));
    return rows.map((g) => ({
      id: g.id,
      title: g.title,
      targetAmount: Number(g.targetAmount),
      currentAmount: Number(g.currentAmount),
      targetDate: g.targetDate,
      createdAt: g.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('Failed to list financial goals:', error);
    throw new Error('Database error while loading financial goals.', { cause: error });
  }
}

export async function createGoal(
  uid: string,
  input: { title: string; targetAmount: number; currentAmount?: number; targetDate?: string | null }
) {
  if (!usePostgres()) return localRepo.createGoal(uid, input);
  try {
    const inserted = await db
      .insert(financialGoals)
      .values({
        userId: uid,
        title: input.title.trim(),
        targetAmount: input.targetAmount.toFixed(2),
        currentAmount: (input.currentAmount ?? 0).toFixed(2),
        targetDate: input.targetDate ?? null,
      })
      .returning();
    const g = inserted[0];
    return {
      id: g.id,
      title: g.title,
      targetAmount: Number(g.targetAmount),
      currentAmount: Number(g.currentAmount),
      targetDate: g.targetDate,
      createdAt: g.createdAt.toISOString(),
    };
  } catch (error) {
    console.error('Failed to create financial goal:', error);
    throw new Error('Database error while creating goal.', { cause: error });
  }
}

export async function listChatSessions(uid: string) {
  if (!usePostgres()) return localRepo.listChatSessions(uid);
  try {
    const rows = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.userId, uid))
      .orderBy(desc(chatSessions.updatedAt))
      .limit(20);
    return rows.map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
  } catch (error) {
    console.error('Failed to list chat sessions:', error);
    throw new Error('Database error while loading chat sessions.', { cause: error });
  }
}

export async function getChatSessionWithMessages(uid: string, sessionId: string) {
  if (!usePostgres()) return localRepo.getChatSessionWithMessages(uid, sessionId);
  try {
    const sess = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, uid)))
      .limit(1);
    if (sess.length === 0) return null;

    const msgs = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.sessionId, sessionId), eq(chatMessages.userId, uid)))
      .orderBy(chatMessages.createdAt);

    return {
      session: {
        id: sess[0].id,
        title: sess[0].title,
        createdAt: sess[0].createdAt.toISOString(),
        updatedAt: sess[0].updatedAt.toISOString(),
      },
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        toolMetadata: m.toolMetadata,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error('Failed to get chat session:', error);
    throw new Error('Database error while fetching chat conversation.', { cause: error });
  }
}

export async function createChatSession(uid: string, title: string): Promise<string> {
  if (!usePostgres()) return localRepo.createChatSession(uid, title);
  try {
    const inserted = await db
      .insert(chatSessions)
      .values({ userId: uid, title: title.slice(0, 80) })
      .returning({ id: chatSessions.id });
    return inserted[0].id;
  } catch (error) {
    console.error('Failed to create chat session:', error);
    throw new Error('Database error while creating chat session.', { cause: error });
  }
}

export async function appendChatMessage(
  uid: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  toolMetadata?: unknown
) {
  if (!usePostgres()) return localRepo.appendChatMessage(uid, sessionId, role, content, toolMetadata);
  try {
    await db.insert(chatMessages).values({
      sessionId,
      userId: uid,
      role,
      content,
      toolMetadata: toolMetadata ?? null,
    });
    await db
      .update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, uid)));
  } catch (error) {
    console.error('Failed to append chat message:', error);
    throw new Error('Database error while saving chat message.', { cause: error });
  }
}

function mapReminderRow(row: typeof paymentReminders.$inferSelect): PaymentReminderRecord {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    reminderType: row.reminderType as ReminderType,
    merchant: row.merchant,
    categoryName: row.categoryName,
    amount: Number(row.amount),
    dueDate: row.dueDate,
    recurrence: row.recurrence as ReminderRecurrence,
    remindDaysBefore: row.remindDaysBefore,
    status: row.status as ReminderStatus,
    notes: row.notes,
    lastPaidAt: row.lastPaidAt ? row.lastPaidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPaymentReminders(uid: string): Promise<PaymentReminderRecord[]> {
  if (!usePostgres()) return localRepo.listPaymentReminders(uid);
  try {
    const rows = await db
      .select()
      .from(paymentReminders)
      .where(eq(paymentReminders.userId, uid))
      .orderBy(paymentReminders.dueDate);
    return rows.map(mapReminderRow);
  } catch (error) {
    console.error('Failed to list payment reminders:', error);
    throw new Error('Database error while loading reminders.', { cause: error });
  }
}

export async function seedDemoRemindersIfEmpty(uid: string): Promise<void> {
  if (!usePostgres()) return localRepo.seedDemoRemindersIfEmpty(uid);
  try {
    const existing = await db
      .select({ id: paymentReminders.id })
      .from(paymentReminders)
      .where(eq(paymentReminders.userId, uid))
      .limit(1);
    if (existing.length > 0) return;

    const demoItems = buildDemoReminders();
    await db.insert(paymentReminders).values(
      demoItems.map((item) => ({
        userId: uid,
        title: item.title,
        reminderType: item.reminderType,
        merchant: item.merchant,
        categoryName: item.categoryName,
        amount: item.amount.toFixed(2),
        dueDate: item.dueDate,
        recurrence: item.recurrence,
        remindDaysBefore: item.remindDaysBefore,
        status: 'PENDING',
        notes: item.notes,
      }))
    );
  } catch (error) {
    console.error('Failed to seed demo reminders:', error);
  }
}

export async function createPaymentReminder(
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
  if (!usePostgres()) return localRepo.createPaymentReminder(uid, input);
  try {
    const inserted = await db
      .insert(paymentReminders)
      .values({
        userId: uid,
        title: input.title.trim(),
        reminderType: input.reminderType,
        merchant: input.merchant?.trim() || null,
        categoryName: input.categoryName?.trim() || 'Other',
        amount: input.amount.toFixed(2),
        dueDate: input.dueDate,
        recurrence: input.recurrence,
        remindDaysBefore: input.remindDaysBefore ?? 3,
        status: 'PENDING',
        notes: input.notes?.trim() || null,
      })
      .returning();
    return mapReminderRow(inserted[0]);
  } catch (error) {
    console.error('Failed to create payment reminder:', error);
    throw new Error('Database error while creating reminder.', { cause: error });
  }
}

export async function updatePaymentReminder(
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
  if (!usePostgres()) return localRepo.updatePaymentReminder(uid, id, updates);
  try {
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.title !== undefined) setData.title = updates.title.trim();
    if (updates.reminderType !== undefined) setData.reminderType = updates.reminderType;
    if (updates.merchant !== undefined) setData.merchant = updates.merchant?.trim() || null;
    if (updates.categoryName !== undefined) setData.categoryName = updates.categoryName;
    if (updates.amount !== undefined) setData.amount = updates.amount.toFixed(2);
    if (updates.dueDate !== undefined) setData.dueDate = updates.dueDate;
    if (updates.recurrence !== undefined) setData.recurrence = updates.recurrence;
    if (updates.remindDaysBefore !== undefined) setData.remindDaysBefore = updates.remindDaysBefore;
    if (updates.status !== undefined) setData.status = updates.status;
    if (updates.notes !== undefined) setData.notes = updates.notes?.trim() || null;

    const updated = await db
      .update(paymentReminders)
      .set(setData)
      .where(and(eq(paymentReminders.id, id), eq(paymentReminders.userId, uid)))
      .returning();

    return updated.length > 0 ? mapReminderRow(updated[0]) : null;
  } catch (error) {
    console.error('Failed to update payment reminder:', error);
    throw new Error('Database error while updating reminder.', { cause: error });
  }
}

export async function markPaymentReminderPaid(
  uid: string,
  id: string
): Promise<{ reminder: PaymentReminderRecord; advancedToNextCycle: boolean } | null> {
  if (!usePostgres()) return localRepo.markPaymentReminderPaid(uid, id);
  try {
    const existingRows = await db
      .select()
      .from(paymentReminders)
      .where(and(eq(paymentReminders.id, id), eq(paymentReminders.userId, uid)))
      .limit(1);
    if (existingRows.length === 0) return null;

    const existing = existingRows[0];
    const recurrence = existing.recurrence as ReminderRecurrence;
    const now = new Date();

    if (recurrence === 'ONCE') {
      const updated = await db
        .update(paymentReminders)
        .set({
          status: 'PAID',
          lastPaidAt: now,
          updatedAt: now,
        })
        .where(and(eq(paymentReminders.id, id), eq(paymentReminders.userId, uid)))
        .returning();
      return { reminder: mapReminderRow(updated[0]), advancedToNextCycle: false };
    }

    const nextDue = computeNextRecurrenceDate(existing.dueDate, recurrence);
    const updated = await db
      .update(paymentReminders)
      .set({
        dueDate: nextDue,
        status: 'PENDING',
        lastPaidAt: now,
        updatedAt: now,
      })
      .where(and(eq(paymentReminders.id, id), eq(paymentReminders.userId, uid)))
      .returning();
    return { reminder: mapReminderRow(updated[0]), advancedToNextCycle: true };
  } catch (error) {
    console.error('Failed to mark reminder paid:', error);
    throw new Error('Database error while marking reminder paid.', { cause: error });
  }
}

export async function deletePaymentReminder(uid: string, id: string): Promise<boolean> {
  if (!usePostgres()) return localRepo.deletePaymentReminder(uid, id);
  try {
    const deleted = await db
      .delete(paymentReminders)
      .where(and(eq(paymentReminders.id, id), eq(paymentReminders.userId, uid)))
      .returning({ id: paymentReminders.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Failed to delete payment reminder:', error);
    throw new Error('Database error while deleting reminder.', { cause: error });
  }
}

