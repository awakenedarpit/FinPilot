# FinPilot AI — Versioned API Contract (`/api/v1`)

All protected endpoints require an `Authorization: Bearer <token>` header (either a verified Firebase ID Token or an HMAC-signed isolated Demo Sandbox token). All database queries are scoped strictly by the server-verified `uid`—never from client request bodies.

## Public Endpoints
- `GET /api/v1/health` — Backend health & Gemini configuration status.
- `POST /api/v1/auth/demo-session` — Issues a scoped token for the synthetic INR demo sandbox (`demo_indian_salaried_profile`).
- `GET /api/v1/demo/sample-csv` — Downloads `sample-data/demo-transactions.csv`.

## Authenticated Endpoints
- `GET /api/v1/profile`, `PATCH /api/v1/profile` — Manage display name, reporting currency (`INR`, `USD`, `EUR`, `GBP`), optional opening balance, and onboarding state.
- `GET /api/v1/categories` — List system and user categories.
- `GET /api/v1/transactions` — Paginated ledger supporting `search`, `category`, `type`, `startDate`, `endDate`.
- `GET /api/v1/transactions/export` — Exports filtered transaction history as an RFC-4180 CSV file (`text/csv`) with formula-injection neutralization.
- `POST /api/v1/transactions` — Create manual transaction with automatic hybrid classification when category is omitted.
- `GET / PATCH / DELETE /api/v1/transactions/:id` — Inspect, correct category (`user_override`), or delete a transaction.
- `POST /api/v1/imports/preview` — Parse, normalize, classify, and validate CSV upload; returns `batchId`, valid/invalid/duplicate counts, and invalid row details.
- `POST /api/v1/imports/confirm` — Idempotently commits valid, non-duplicate rows from a preview batch.
- `GET /api/v1/imports` — List import batch history.
- `POST /api/v1/demo/load`, `DELETE /api/v1/demo/clear` — Explicitly load or clear `source = 'DEMO'` records.
- `GET /api/v1/analytics/overview`, `/spending`, `/trends`, `/recurring` — Deterministic financial calculations.
- `GET /api/v1/forecasts`, `POST /api/v1/forecasts/generate` — EWMA + recurring cash-flow forecast with uncertainty bands and holdout MAPE evaluation.
- `GET /api/v1/anomalies`, `POST /api/v1/anomalies/analyze` — MAD/IQR outlier, category spike, and 48h duplicate alerts.
- `POST /api/v1/simulations` — Deterministic what-if scenario calculator.
- `GET / POST /api/v1/goals` — Savings goal tracking.
- `GET / POST / PATCH / DELETE /api/v1/reminders`, `POST /api/v1/reminders/:id/mark-paid`, `POST /api/v1/reminders/import-recurring` — Manage upcoming expense deadlines, pending EMIs, subscriptions, recurring bill auto-sync, and cycle advancement.
- `GET /api/v1/integrations` — Reports `AccountAggregatorStubAdapter` status (`not_enabled`).
- `POST /api/v1/copilot/chat`, `GET /api/v1/copilot/sessions`, `GET /api/v1/copilot/sessions/:id` — Central Gemini AI Orchestrator with 6 registered tools, evidence cards, and deterministic fallback.
