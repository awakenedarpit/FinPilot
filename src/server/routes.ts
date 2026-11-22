import { Router } from 'express';
import { z } from 'zod';
import {
  computeMerchantAnalysis,
  computeMonthlyTrends,
  computeOverviewMetrics,
  computeSpendingByCategory,
  detectRecurringExpenses,
} from '../core/analytics.ts';
import { detectAnomalies } from '../core/anomaly.ts';
import { exportTransactionsToCsv } from '../core/csvExport.ts';
import { parseAndPreviewCsv } from '../core/csvParser.ts';
import { generateDemoCsvString } from '../core/demoData.ts';
import { generateCashFlowForecast } from '../core/forecasting.ts';
import { AccountAggregatorStubAdapter } from '../core/integrations.ts';
import {
  buildRemindersFromRecurringCandidates,
  enrichAndSortReminders,
  summarizeReminderNotifications,
} from '../core/reminders.ts';
import { runScenarioSimulation } from '../core/simulation.ts';
import { runCopilotOrchestrator } from './ai/orchestrator.ts';
import {
  type AuthRequest,
  createDemoSessionToken,
  DEMO_EMAIL,
  DEMO_NAME,
  DEMO_UID,
  requireAuth,
} from './authMiddleware.ts';
import {
  appendChatMessage,
  clearDemoDatasetForUser,
  confirmImportBatch,
  createChatSession,
  createGoal,
  createManualTransaction,
  createPaymentReminder,
  deletePaymentReminder,
  deleteTransaction,
  ensureAndListCategories,
  getAllUserTransactions,
  getChatSessionWithMessages,
  getOrCreateUser,
  getTransactionById,
  getUserExistingDedupeHashes,
  getUserProfile,
  listChatSessions,
  listGoals,
  listImportBatches,
  listPaymentReminders,
  listTransactionsFiltered,
  listTransactionsForExport,
  loadDemoDatasetForUser,
  markPaymentReminderPaid,
  saveForecastSnapshots,
  saveImportPreviewBatch,
  saveInsightsSnapshots,
  seedDemoRemindersIfEmpty,
  updatePaymentReminder,
  updateTransaction,
  updateUserProfile,
} from './dbRepository.ts';

export const apiRouter = Router();

const aaAdapter = new AccountAggregatorStubAdapter();

// Health check (public)
apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'FinPilot AI API',
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    ),
    timestamp: new Date().toISOString(),
  });
});

// Isolated Demo Sandbox session token (explicitly synthetic INR data, never touches real user accounts)
apiRouter.post('/auth/demo-session', async (_req, res) => {
  try {
    await getOrCreateUser(DEMO_UID, DEMO_EMAIL, DEMO_NAME);
    const existing = await getAllUserTransactions(DEMO_UID);
    if (existing.length === 0) {
      await loadDemoDatasetForUser(DEMO_UID);
    }
    await seedDemoRemindersIfEmpty(DEMO_UID);
    const token = createDemoSessionToken();
    res.json({
      token,
      user: {
        uid: DEMO_UID,
        email: DEMO_EMAIL,
        name: DEMO_NAME,
        isDemo: true,
      },
    });
  } catch (error) {
    console.error('Demo session initialization failed:', error);
    res.status(500).json({ error: 'Unable to initialize demo workspace.' });
  }
});

// Public sample CSV download
apiRouter.get('/demo/sample-csv', (_req, res) => {
  const csv = generateDemoCsvString();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="demo-transactions.csv"');
  res.send(csv);
});

// All routes below require authentication
apiRouter.use(requireAuth);

// Profile
apiRouter.get('/profile', async (req: AuthRequest, res) => {
  try {
    const profile = await getUserProfile(req.authUser!.uid);
    res.json({
      ...profile,
      isDemo: req.authUser!.isDemo,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

const profilePatchSchema = z.object({
  fullName: z.string().max(120).nullable().optional(),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
  openingBalance: z.number().min(-100000000).max(1000000000).nullable().optional(),
  onboardingCompleted: z.boolean().optional(),
});

apiRouter.patch('/profile', async (req: AuthRequest, res) => {
  const parsed = profilePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid profile update payload', details: parsed.error.issues });
    return;
  }
  try {
    const updated = await updateUserProfile(req.authUser!.uid, parsed.data);
    res.json({ ...updated, isDemo: req.authUser!.isDemo });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Categories
apiRouter.get('/categories', async (req: AuthRequest, res) => {
  try {
    const cats = await ensureAndListCategories(req.authUser!.uid);
    res.json({ categories: cats });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Transactions CRUD + Search/Filters
apiRouter.get('/transactions', async (req: AuthRequest, res) => {
  try {
    const { search, category, type, startDate, endDate, page, pageSize } = req.query;
    const result = await listTransactionsFiltered(req.authUser!.uid, {
      search: typeof search === 'string' ? search : undefined,
      category: typeof category === 'string' ? category : undefined,
      type: type === 'CREDIT' || type === 'DEBIT' ? type : undefined,
      startDate: typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : undefined,
      endDate: typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

const createTxSchema = z.object({
  description: z.string().min(1).max(240),
  merchant: z.string().max(120).nullable().optional(),
  amount: z.number().positive().max(100000000),
  transactionType: z.enum(['CREDIT', 'DEBIT']),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryName: z.string().max(80).optional(),
  isRecurring: z.boolean().optional(),
});

apiRouter.post('/transactions', async (req: AuthRequest, res) => {
  const parsed = createTxSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid transaction payload', details: parsed.error.issues });
    return;
  }
  try {
    const created = await createManualTransaction(req.authUser!.uid, parsed.data);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.get('/transactions/export', async (req: AuthRequest, res) => {
  try {
    const { search, category, type, startDate, endDate } = req.query;
    const rows = await listTransactionsForExport(req.authUser!.uid, {
      search: typeof search === 'string' ? search : undefined,
      category: typeof category === 'string' ? category : undefined,
      type: type === 'CREDIT' || type === 'DEBIT' ? type : undefined,
      startDate:
        typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
          ? startDate
          : undefined,
      endDate:
        typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : undefined,
    });

    const csv = exportTransactionsToCsv(rows);
    const dateStamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="finpilot-transactions-${dateStamp}.csv"`
    );
    res.setHeader('X-Export-Row-Count', String(rows.length));
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.get('/transactions/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  if (!z.string().uuid().safeParse(id).success) {
    res.status(400).json({ error: 'Invalid transaction id format' });
    return;
  }
  try {
    const tx = await getTransactionById(req.authUser!.uid, id);
    if (!tx) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    res.json(tx);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

const patchTxSchema = z.object({
  categoryName: z.string().min(1).max(80).optional(),
  description: z.string().min(1).max(240).optional(),
  merchant: z.string().max(120).optional(),
  amount: z.number().positive().max(100000000).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isRecurring: z.boolean().optional(),
});

apiRouter.patch('/transactions/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  if (!z.string().uuid().safeParse(id).success) {
    res.status(400).json({ error: 'Invalid transaction id format' });
    return;
  }
  const parsed = patchTxSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid transaction update', details: parsed.error.issues });
    return;
  }
  try {
    const updated = await updateTransaction(req.authUser!.uid, id, parsed.data);
    if (!updated) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.delete('/transactions/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  if (!z.string().uuid().safeParse(id).success) {
    res.status(400).json({ error: 'Invalid transaction id format' });
    return;
  }
  try {
    const removed = await deleteTransaction(req.authUser!.uid, id);
    if (!removed) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    res.json({ deleted: true, id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// CSV Imports
const previewImportSchema = z.object({
  filename: z.string().min(1).max(160),
  csvText: z.string().min(1).max(2_500_000),
});

apiRouter.post('/imports/preview', async (req: AuthRequest, res) => {
  const parsed = previewImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid CSV upload payload', details: parsed.error.issues });
    return;
  }
  try {
    const existingHashes = await getUserExistingDedupeHashes(req.authUser!.uid);
    const preview = parseAndPreviewCsv(parsed.data.csvText, parsed.data.filename, existingHashes);
    const batchId = await saveImportPreviewBatch(req.authUser!.uid, preview);
    res.json({ ...preview, batchId });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

const confirmImportSchema = z.object({
  batchId: z.string().uuid(),
});

apiRouter.post('/imports/confirm', async (req: AuthRequest, res) => {
  const parsed = confirmImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid batchId UUID is required' });
    return;
  }
  try {
    const summary = await confirmImportBatch(req.authUser!.uid, parsed.data.batchId);
    if (!summary) {
      res.status(404).json({ error: 'Import batch not found' });
      return;
    }
    await updateUserProfile(req.authUser!.uid, { onboardingCompleted: true });
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.get('/imports', async (req: AuthRequest, res) => {
  try {
    const batches = await listImportBatches(req.authUser!.uid);
    res.json({ imports: batches });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Explicit user-initiated Demo Data Load / Clear
apiRouter.post('/demo/load', async (req: AuthRequest, res) => {
  try {
    const result = await loadDemoDatasetForUser(req.authUser!.uid);
    res.json({
      ...result,
      label: 'DEMO',
      message: 'Synthetic Indian INR demo transactions loaded for exploration.',
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.delete('/demo/clear', async (req: AuthRequest, res) => {
  try {
    const result = await clearDemoDatasetForUser(req.authUser!.uid);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Analytics
apiRouter.get('/analytics/overview', async (req: AuthRequest, res) => {
  try {
    const [profile, txs] = await Promise.all([
      getUserProfile(req.authUser!.uid),
      getAllUserTransactions(req.authUser!.uid),
    ]);
    const overview = computeOverviewMetrics(
      txs,
      profile?.currency ?? 'INR',
      profile?.openingBalance ?? null
    );
    res.json(overview);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.get('/analytics/spending', async (req: AuthRequest, res) => {
  try {
    const txs = await getAllUserTransactions(req.authUser!.uid);
    const categories = computeSpendingByCategory(txs);
    const merchants = computeMerchantAnalysis(txs);
    res.json({ categories, merchants });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.get('/analytics/trends', async (req: AuthRequest, res) => {
  try {
    const txs = await getAllUserTransactions(req.authUser!.uid);
    const trends = computeMonthlyTrends(txs);
    res.json({ trends });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.get('/analytics/recurring', async (req: AuthRequest, res) => {
  try {
    const txs = await getAllUserTransactions(req.authUser!.uid);
    const recurring = detectRecurringExpenses(txs);
    res.json({ recurring });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Forecasts
apiRouter.get('/forecasts', async (req: AuthRequest, res) => {
  try {
    const [profile, txs] = await Promise.all([
      getUserProfile(req.authUser!.uid),
      getAllUserTransactions(req.authUser!.uid),
    ]);
    const forecast = generateCashFlowForecast(txs, profile?.openingBalance ?? null, 3);
    res.json(forecast);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.post('/forecasts/generate', async (req: AuthRequest, res) => {
  try {
    const horizon = typeof req.body?.horizonMonths === 'number' ? req.body.horizonMonths : 3;
    const [profile, txs] = await Promise.all([
      getUserProfile(req.authUser!.uid),
      getAllUserTransactions(req.authUser!.uid),
    ]);
    const forecast = generateCashFlowForecast(
      txs,
      profile?.openingBalance ?? null,
      Math.min(6, Math.max(1, Math.round(horizon)))
    );
    await saveForecastSnapshots(req.authUser!.uid, forecast);
    res.json(forecast);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Anomalies
apiRouter.get('/anomalies', async (req: AuthRequest, res) => {
  try {
    const txs = await getAllUserTransactions(req.authUser!.uid);
    const alerts = detectAnomalies(txs);
    res.json({ alerts });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.post('/anomalies/analyze', async (req: AuthRequest, res) => {
  try {
    const txs = await getAllUserTransactions(req.authUser!.uid);
    const alerts = detectAnomalies(txs);
    await saveInsightsSnapshots(req.authUser!.uid, alerts);
    res.json({ alerts, analyzedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Scenario Simulation
const simulationSchema = z.object({
  expenseAdjustmentPercent: z.number().min(-90).max(200).optional(),
  targetCategory: z.string().max(80).optional(),
  categoryAdjustmentPercent: z.number().min(-100).max(200).optional(),
  additionalMonthlyExpense: z.number().min(0).max(10000000).optional(),
  additionalMonthlyIncome: z.number().min(0).max(10000000).optional(),
  savingsContributionGoal: z.number().min(0).max(10000000).optional(),
});

apiRouter.post('/simulations', async (req: AuthRequest, res) => {
  const parsed = simulationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid simulation parameters', details: parsed.error.issues });
    return;
  }
  try {
    const txs = await getAllUserTransactions(req.authUser!.uid);
    const result = runScenarioSimulation(txs, parsed.data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Financial Goals
apiRouter.get('/goals', async (req: AuthRequest, res) => {
  try {
    const goals = await listGoals(req.authUser!.uid);
    res.json({ goals });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

const createGoalSchema = z.object({
  title: z.string().min(1).max(120),
  targetAmount: z.number().positive().max(1000000000),
  currentAmount: z.number().min(0).max(1000000000).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

apiRouter.post('/goals', async (req: AuthRequest, res) => {
  const parsed = createGoalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid goal payload', details: parsed.error.issues });
    return;
  }
  try {
    const goal = await createGoal(req.authUser!.uid, parsed.data);
    res.status(201).json(goal);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Deadlines & Payment Reminders (Expenses, Pending EMIs, Bills, Subscriptions)
const reminderTypeEnum = z.enum(['EMI', 'BILL', 'EXPENSE', 'SUBSCRIPTION', 'TAX']);
const reminderRecurrenceEnum = z.enum(['ONCE', 'MONTHLY', 'QUARTERLY', 'YEARLY']);
const reminderStatusEnum = z.enum(['PENDING', 'PAID', 'DISMISSED']);

apiRouter.get('/reminders', async (req: AuthRequest, res) => {
  try {
    if (req.authUser!.isDemo) {
      await seedDemoRemindersIfEmpty(req.authUser!.uid);
    }
    const raw = await listPaymentReminders(req.authUser!.uid);
    const reminders = enrichAndSortReminders(raw);
    const summary = summarizeReminderNotifications(raw);
    res.json({ reminders, summary });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

const createReminderSchema = z.object({
  title: z.string().min(1).max(160),
  reminderType: reminderTypeEnum.default('BILL'),
  merchant: z.string().max(120).nullable().optional(),
  categoryName: z.string().max(80).optional(),
  amount: z.number().positive().max(100000000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recurrence: reminderRecurrenceEnum.default('ONCE'),
  remindDaysBefore: z.number().int().min(0).max(60).optional(),
  notes: z.string().max(400).nullable().optional(),
});

apiRouter.post('/reminders', async (req: AuthRequest, res) => {
  const parsed = createReminderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid reminder payload', details: parsed.error.issues });
    return;
  }
  try {
    const created = await createPaymentReminder(req.authUser!.uid, parsed.data);
    const [enriched] = enrichAndSortReminders([created]);
    res.status(201).json(enriched);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.post('/reminders/import-recurring', async (req: AuthRequest, res) => {
  try {
    const uid = req.authUser!.uid;
    const [txs, existing] = await Promise.all([
      getAllUserTransactions(uid),
      listPaymentReminders(uid),
    ]);
    const candidates = detectRecurringExpenses(txs);
    const toCreate = buildRemindersFromRecurringCandidates(candidates, existing);

    for (const item of toCreate) {
      await createPaymentReminder(uid, item);
    }

    const updated = await listPaymentReminders(uid);
    res.json({
      importedCount: toCreate.length,
      reminders: enrichAndSortReminders(updated),
      summary: summarizeReminderNotifications(updated),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.post('/reminders/:id/mark-paid', async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  if (!z.string().uuid().safeParse(id).success) {
    res.status(400).json({ error: 'Invalid reminder id format' });
    return;
  }
  try {
    const result = await markPaymentReminderPaid(req.authUser!.uid, id);
    if (!result) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }
    const [enriched] = enrichAndSortReminders([result.reminder]);
    res.json({
      reminder: enriched,
      advancedToNextCycle: result.advancedToNextCycle,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

const patchReminderSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  reminderType: reminderTypeEnum.optional(),
  merchant: z.string().max(120).nullable().optional(),
  categoryName: z.string().min(1).max(80).optional(),
  amount: z.number().positive().max(100000000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  recurrence: reminderRecurrenceEnum.optional(),
  remindDaysBefore: z.number().int().min(0).max(60).optional(),
  status: reminderStatusEnum.optional(),
  notes: z.string().max(400).nullable().optional(),
});

apiRouter.patch('/reminders/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  if (!z.string().uuid().safeParse(id).success) {
    res.status(400).json({ error: 'Invalid reminder id format' });
    return;
  }
  const parsed = patchReminderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid reminder update', details: parsed.error.issues });
    return;
  }
  try {
    const updated = await updatePaymentReminder(req.authUser!.uid, id, parsed.data);
    if (!updated) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }
    const [enriched] = enrichAndSortReminders([updated]);
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.delete('/reminders/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  if (!z.string().uuid().safeParse(id).success) {
    res.status(400).json({ error: 'Invalid reminder id format' });
    return;
  }
  try {
    const removed = await deletePaymentReminder(req.authUser!.uid, id);
    if (!removed) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }
    res.json({ deleted: true, id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Authorized Integration Status (honest disabled status, never simulates live bank login)
apiRouter.get('/integrations', async (_req, res) => {
  const status = await aaAdapter.getConsentStatus();
  res.json({ providers: [status] });
});

// AI Copilot
const copilotChatSchema = z.object({
  question: z.string().min(2).max(1000),
  sessionId: z.string().uuid().optional(),
});

apiRouter.post('/copilot/chat', async (req: AuthRequest, res) => {
  const parsed = copilotChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please enter a valid financial question (2-1000 chars).' });
    return;
  }

  try {
    const uid = req.authUser!.uid;
    let sessionId = parsed.data.sessionId;
    if (!sessionId) {
      sessionId = await createChatSession(uid, parsed.data.question);
    } else {
      const existing = await getChatSessionWithMessages(uid, sessionId);
      if (!existing) {
        sessionId = await createChatSession(uid, parsed.data.question);
      }
    }

    await appendChatMessage(uid, sessionId, 'user', parsed.data.question);

    const [profile, txs] = await Promise.all([
      getUserProfile(uid),
      getAllUserTransactions(uid),
    ]);

    const result = await runCopilotOrchestrator({
      sessionId,
      question: parsed.data.question,
      transactions: txs,
      currency: profile?.currency ?? 'INR',
      openingBalance: profile?.openingBalance ?? null,
    });

    await appendChatMessage(uid, sessionId, 'assistant', result.answer, {
      intent: result.intent,
      tools_used: result.tools_used,
      evidence: result.evidence,
      limitations: result.limitations,
      fallback_used: result.fallback_used,
      generated_at: result.generated_at,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.get('/copilot/sessions', async (req: AuthRequest, res) => {
  try {
    const sessions = await listChatSessions(req.authUser!.uid);
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

apiRouter.get('/copilot/sessions/:id', async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  if (!z.string().uuid().safeParse(id).success) {
    res.status(400).json({ error: 'Invalid session id' });
    return;
  }
  try {
    const data = await getChatSessionWithMessages(req.authUser!.uid, id);
    if (!data) {
      res.status(404).json({ error: 'Chat session not found' });
      return;
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
