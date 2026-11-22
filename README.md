# FinPilot AI

**Your Money. Understood. Your Future. Prepared.**

FinPilot AI is a full-stack personal financial intelligence platform built for Indian students, salaried professionals, freelancers, and individuals. It converts raw bank CSV statements and manual ledger entries into deterministic financial analytics, recurring commitment detection, explainable MAD/IQR anomaly alerts, EWMA cash-flow forecasts, interactive scenario simulations, and a tool-grounded Google Gemini AI Copilot.

## Core Architecture

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Recharts, Lucide Icons (`src/`)
- **Backend**: Express + TypeScript (`server.ts`, `src/server/`) serving versioned `/api/v1/*` endpoints
- **Database**: Cloud SQL (PostgreSQL) managed with Drizzle ORM (`src/db/schema.ts`, `src/db/drizzle.config.ts`)
- **Authentication**: Firebase Authentication (Google Sign-In) with backend ID token verification (`firebase-admin`) + an isolated synthetic INR Demo Sandbox (`POST /api/v1/auth/demo-session`)
- **AI Orchestrator**: Central server-side `@google/genai` (`gemini-4-hydrogen`) orchestrator with 6 registered deterministic tools (`transaction_summary`, `spending_analysis`, `cashflow_forecast`, `anomaly_analysis`, `scenario_simulation`, `financial_summary`) and graceful deterministic fallback

## Deterministic Principles

1. Financial calculations happen deterministically on the backend—AI never fabricates amounts, balances, or forecasts.
2. Net cash flow (`credits - debits`) is never misrepresented as bank account balance; recorded/projected balance is only computed when an explicit opening balance is provided.
3. Savings rate handles zero income safely without division-by-zero errors.
4. Anomaly detection uses Median Absolute Deviation (MAD), IQR fences, and 48-hour duplicate matching—never labeling alerts as confirmed fraud.
5. Live banking connections (`AccountAggregatorStubAdapter`) are explicitly disabled in MVP; no bank passwords, UPI PINs, or OTPs are ever collected.

## Local Development & Verification

```bash
npm install
npm run lint
npm run build
npx --yes tsx --test src/core/engine.test.ts
npm run dev
```

## Sample Dataset

A clearly labelled synthetic Indian INR dataset is included at `sample-data/demo-transactions.csv` (and via `GET /api/v1/demo/sample-csv`), covering 4 months of realistic transactions (`SWIGGY`, `ZOMATO`, `BESCOM`, `AIRTEL FIBER`, `RENT PAYMENT`, `SALARY CREDIT`, `FREELANCE UI CONSULTING`, `CROMA`, `THIRD WAVE COFFEE`).

## Hackathon Demo Flow

1. Open the app and click **Try Interactive Demo** (or append `?autostart=1`).
2. Inspect the **Overview** KPI strip, Income vs. Expenses trend, and Top Expense Categories.
3. Open **Transactions**, click **Import CSV**, and click **Load & Preview Sample Indian CSV** to inspect column detection, invalid/duplicate checks, and hybrid classification confidence.
4. Change any transaction's category inline and verify persistence.
5. Inspect **Analytics** for merchant concentration and detected recurring bills.
6. Open **Forecasts** to view the 3-month EWMA projection with uncertainty bands, adjust the **Scenario Simulation Studio** sliders, and review **Explainable Anomaly Alerts**.
7. Open **AI Copilot** and ask `"Where did most of my money go?"` or `"What if I reduce my shopping expenses by 15%?"` to inspect executed tools and evidence cards.
