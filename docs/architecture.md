# FinPilot AI — System Architecture

## Overview
FinPilot AI is a full-stack personal financial intelligence application built on a **single-origin Express + Vite React 19** architecture running on port `3000`, backed by **Cloud SQL for PostgreSQL** (via Drizzle ORM), **Firebase Authentication**, and the **Google Gemini API (`@google/genai`)**.

## Layer Separation

1. **Frontend Client (`/src/components`, `/src/lib`)**
   - **Landing & Auth (`LandingPage.tsx`, `src/lib/firebase.ts`)**: Presents core platform capabilities, provides Google Sign-In via Firebase Auth, and offers an isolated synthetic INR Demo Sandbox launcher (`POST /api/v1/auth/demo-session` or `?autostart=1`).
   - **Authenticated Workspace (`AppShell.tsx`)**: Navigation across `Overview`, `Transactions`, `Analytics`, `Forecasts`, `Copilot`, and `Settings` (with Onboarding gate when `onboardingCompleted === false`).
   - **API Client (`src/lib/api.ts`)**: Attaches `Authorization: Bearer <token>` on all `/api/v1/*` requests.

2. **Express API & Security Layer (`/server.ts`, `/src/server`)**
   - `requireAuth` (`src/server/authMiddleware.ts`) verifies Firebase ID tokens via `firebase-admin` or HMAC-signed demo sandbox tokens (`demo.<uid>.<ts>.<sig>`).
   - Every database query in `src/server/dbRepository.ts` is strictly scoped by `req.authUser.uid`.
   - `src/server/routes.ts` validates all payloads with `zod` before delegating to deterministic engines or database persistence.

3. **Deterministic Core Financial Engines (`/src/core`)**
   - `csvParser.ts`: Auto-detects bank CSV headers, normalizes Indian/ISO dates and currency strings, neutralizes formula injection prefixes, preserves invalid row diagnostics, and computes SHA-256 deduplication hashes.
   - `categorization.ts`: Hybrid classifier combining deterministic Indian & global merchant regex rules with a calibrated Naive Bayes fallback and transparent confidence/method metadata.
   - `analytics.ts`: Computes overview KPIs (zero-income-safe savings rate, opening-balance-gated account balance), monthly trends, category shares, merchant aggregations, and recurring expense cadence.
   - `forecasting.ts`: EWMA + recurring cash-flow projector with IQR/MAD uncertainty bounds, holdout MAPE backtesting, and explicit `insufficient_data` reporting when history is below threshold.
   - `anomaly.ts`: MAD & IQR outlier detection, category spike comparison, and 48-hour duplicate detection without black-box "fraud" claims.
   - `simulation.ts`: Deterministic what-if scenario impact engine.
   - `integrations.ts`: Defines the `FinancialDataProvider` contract and `AccountAggregatorStubAdapter` (honestly reports `not_enabled`).

4. **Tool-Grounded AI Orchestrator (`/src/server/ai/orchestrator.ts`)**
   - Registers 6 deterministic financial tools (`transaction_summary`, `spending_analysis`, `cashflow_forecast`, `anomaly_analysis`, `scenario_simulation`, `financial_summary`) via `@google/genai` (`gemini-4-hydrogen`).
   - Bounded to a maximum of 4 tool calls per user query, attaches exact evidence rows and limitations, and falls back gracefully to a deterministic local synthesis plan if `GEMINI_API_KEY` is missing or the upstream model call fails.
