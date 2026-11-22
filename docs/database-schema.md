# FinPilot AI — Database Schema (Cloud SQL PostgreSQL + Drizzle ORM)

Defined in `/src/db/schema.ts` and managed via Drizzle Kit (`/src/db/drizzle.config.ts`).

## Tables

1. **`users`**
   - `uid` (PK, text): Server-verified Firebase UID or isolated `demo_indian_salaried_profile`.
   - `email`, `full_name`, `currency` (default `'INR'`), `opening_balance` (`numeric(14,2)`, nullable), `onboarding_completed` (`boolean`), `created_at`, `updated_at`.
2. **`categories`**
   - `id` (UUID PK), `user_id` (nullable FK -> `users.uid` for system categories), `name`, `type` (`EXPENSE | INCOME | TRANSFER`), `parent_category_id`, `is_system`, `created_at`.
   - Seeded with 12 default system categories (`Food`, `Shopping`, `Transport`, `Housing`, `Utilities`, `Healthcare`, `Education`, `Entertainment`, `Salary`, `Freelance Income`, `Transfers`, `Other`).
3. **`transactions`**
   - `id` (UUID PK), `user_id` (FK -> `users.uid`, cascade delete), `description`, `merchant`, `amount` (`numeric(14,2)`), `transaction_type` (`CREDIT | DEBIT`), `category_id` (FK -> `categories.id`), `category_name`, `subcategory`, `transaction_date` (`date`), `source` (`CSV | MANUAL | AUTHORIZED_INTEGRATION | DEMO`), `external_reference`, `dedupe_hash`, `is_recurring`, `classification_confidence`, `classification_method`, `created_at`, `updated_at`.
   - Unique index `uq_transactions_user_dedupe` on `(user_id, dedupe_hash)` enforces per-user idempotency for CSV imports.
4. **`import_batches`**
   - `id` (UUID PK), `user_id` (FK -> `users.uid`), `filename`, `status` (`PREVIEW | CONFIRMED`), `total_rows`, `valid_rows`, `invalid_rows`, `duplicate_rows`, `imported_rows`, `preview_payload` (`jsonb`), `created_at`, `confirmed_at`.
5. **`budgets`**
   - `id` (UUID PK), `user_id` (FK -> `users.uid`), `category_id`, `category_name`, `monthly_limit`, `month`, `created_at`.
6. **`forecasts`**
   - `id` (UUID PK), `user_id` (FK -> `users.uid`), `forecast_date`, `projected_income`, `projected_expenses`, `projected_balance`, `lower_estimate`, `upper_estimate`, `model_version`, `metadata` (`jsonb`), `created_at`.
7. **`insights`**
   - `id` (UUID PK), `user_id` (FK -> `users.uid`), `transaction_id` (nullable FK -> `transactions.id`), `insight_type`, `title`, `description`, `severity` (`LOW | MEDIUM | HIGH`), `evidence` (`jsonb`), `created_at`.
8. **`financial_goals`**
   - `id` (UUID PK), `user_id` (FK -> `users.uid`), `title`, `target_amount`, `current_amount`, `target_date`, `created_at`.
9. **`chat_sessions`**
   - `id` (UUID PK), `user_id` (FK -> `users.uid`), `title`, `created_at`, `updated_at`.
10. **`chat_messages`**
    - `id` (UUID PK), `session_id` (FK -> `chat_sessions.id`, cascade delete), `user_id` (FK -> `users.uid`), `role` (`user | assistant`), `content`, `tool_metadata` (`jsonb`), `created_at`.
11. **`payment_reminders`**
    - `id` (UUID PK), `user_id` (FK -> `users.uid`, cascade delete), `title`, `reminder_type` (`EMI | BILL | EXPENSE | SUBSCRIPTION | TAX`), `merchant`, `category_name`, `amount` (`numeric(14,2)`), `due_date` (`date`), `recurrence` (`ONCE | MONTHLY | QUARTERLY | YEARLY`), `remind_days_before` (`integer`), `status` (`PENDING | PAID | DISMISSED`), `notes`, `last_paid_at`, `created_at`, `updated_at`.
