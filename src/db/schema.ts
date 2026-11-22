import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  uid: text('uid').primaryKey(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  currency: text('currency').notNull().default('INR'),
  openingBalance: numeric('opening_balance', { precision: 14, scale: 2 }),
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').references(() => users.uid, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(), // EXPENSE | INCOME | TRANSFER
    parentCategoryId: uuid('parent_category_id'),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_categories_user_id').on(table.userId)]
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    merchant: text('merchant'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    transactionType: text('transaction_type').notNull(), // CREDIT | DEBIT
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    categoryName: text('category_name').notNull().default('Other'),
    subcategory: text('subcategory'),
    transactionDate: date('transaction_date').notNull(),
    source: text('source').notNull().default('MANUAL'), // CSV | MANUAL | AUTHORIZED_INTEGRATION | DEMO
    externalReference: text('external_reference'),
    dedupeHash: text('dedupe_hash'),
    isRecurring: boolean('is_recurring').notNull().default(false),
    classificationConfidence: numeric('classification_confidence', { precision: 4, scale: 3 }),
    classificationMethod: text('classification_method'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_transactions_user_id').on(table.userId),
    index('idx_transactions_date').on(table.transactionDate),
    index('idx_transactions_category_id').on(table.categoryId),
    uniqueIndex('uq_transactions_user_dedupe').on(table.userId, table.dedupeHash),
  ]
);

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    status: text('status').notNull().default('PREVIEW'), // PREVIEW | CONFIRMED
    totalRows: integer('total_rows').notNull().default(0),
    validRows: integer('valid_rows').notNull().default(0),
    invalidRows: integer('invalid_rows').notNull().default(0),
    duplicateRows: integer('duplicate_rows').notNull().default(0),
    importedRows: integer('imported_rows').notNull().default(0),
    previewPayload: jsonb('preview_payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (table) => [index('idx_import_batches_user_id').on(table.userId)]
);

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    categoryName: text('category_name').notNull(),
    monthlyLimit: numeric('monthly_limit', { precision: 14, scale: 2 }).notNull(),
    month: date('month').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_budgets_user_id').on(table.userId)]
);

export const forecasts = pgTable(
  'forecasts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    forecastDate: date('forecast_date').notNull(),
    projectedIncome: numeric('projected_income', { precision: 14, scale: 2 }).notNull(),
    projectedExpenses: numeric('projected_expenses', { precision: 14, scale: 2 }).notNull(),
    projectedBalance: numeric('projected_balance', { precision: 14, scale: 2 }),
    lowerEstimate: numeric('lower_estimate', { precision: 14, scale: 2 }),
    upperEstimate: numeric('upper_estimate', { precision: 14, scale: 2 }),
    modelVersion: text('model_version').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_forecasts_user_id').on(table.userId)]
);

export const insights = pgTable(
  'insights',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }),
    insightType: text('insight_type').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    severity: text('severity').notNull(), // LOW | MEDIUM | HIGH
    evidence: jsonb('evidence'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_insights_user_id').on(table.userId)]
);

export const financialGoals = pgTable(
  'financial_goals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    targetAmount: numeric('target_amount', { precision: 14, scale: 2 }).notNull(),
    currentAmount: numeric('current_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    targetDate: date('target_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_financial_goals_user_id').on(table.userId)]
);

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_chat_sessions_user_id').on(table.userId)]
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    role: text('role').notNull(), // user | assistant
    content: text('content').notNull(),
    toolMetadata: jsonb('tool_metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_chat_messages_session_id').on(table.sessionId)]
);

export const paymentReminders = pgTable(
  'payment_reminders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    reminderType: text('reminder_type').notNull().default('BILL'), // EMI | BILL | EXPENSE | SUBSCRIPTION | TAX
    merchant: text('merchant'),
    categoryName: text('category_name').notNull().default('Other'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    dueDate: date('due_date').notNull(),
    recurrence: text('recurrence').notNull().default('MONTHLY'), // ONCE | MONTHLY | QUARTERLY | YEARLY
    remindDaysBefore: integer('remind_days_before').notNull().default(3),
    status: text('status').notNull().default('PENDING'), // PENDING | PAID | DISMISSED
    notes: text('notes'),
    lastPaidAt: timestamp('last_paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_payment_reminders_user_id').on(table.userId),
    index('idx_payment_reminders_due_date').on(table.dueDate),
  ]
);

