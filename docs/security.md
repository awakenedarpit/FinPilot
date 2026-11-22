# FinPilot AI — Security & Privacy Architecture

## 1. Authentication & Per-User Data Isolation
- Every route under `/api/v1/*` (except `/health`, `POST /auth/demo-session`, and `GET /demo/sample-csv`) passes through `requireAuth` (`src/server/authMiddleware.ts`).
- Production sessions use **Firebase Authentication**; the backend verifies ID tokens with `firebase-admin` (`adminAuth.verifyIdToken(token)`).
- Requests missing a `Bearer` token, carrying an invalid token, or sending a tampered HMAC demo token receive `401 Unauthorized`.
- The authenticated `uid` is derived exclusively on the server and passed to Drizzle ORM queries in `src/server/dbRepository.ts`. Client payloads cannot override `userId`.

## 2. Synthetic Demo Sandbox Isolation
- Clicking **Try Interactive Demo** (or visiting `?autostart=1`) calls `POST /api/v1/auth/demo-session`, which returns an HMAC-SHA256 signed token scoped strictly to `demo_indian_salaried_profile`.
- Demo records carry `source = 'DEMO'` and are clearly labeled in the UI. Real authenticated user accounts never receive synthetic transactions unless the user explicitly clicks **Load Sample Dataset** in Settings (and can clear them anytime with `DELETE /api/v1/demo/clear`).

## 3. Input Validation & CSV Safety
- All API payloads are validated with `zod` schemas in `src/server/routes.ts` (including UUID validation on `:id` path parameters).
- CSV imports enforce `.csv` extension, a 2 MB size cap, and formula-injection sanitization in `src/core/csvParser.ts` (cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` are neutralized with a leading `'`).
- Duplicate imports are prevented using per-user SHA-256 hashes (`uq_transactions_user_dedupe`) and idempotent `import_batches` confirmation.

## 4. AI Copilot & Banking Boundaries
- `GEMINI_API_KEY` is used strictly on the server inside `src/server/ai/orchestrator.ts`; no API key is ever sent to the browser.
- The Gemini model cannot execute SQL or arbitrary code—it can only invoke the 6 predefined read-only/deterministic calculation tools over the authenticated user's transactions.
- Transaction descriptions are treated as untrusted data inside the system instruction.
- **No Bank Credential Scraping**: FinPilot AI never collects banking passwords, UPI PINs, or OTPs. `AccountAggregatorStubAdapter` (`src/core/integrations.ts`) explicitly reports `not_enabled` until a licensed Account Aggregator integration is configured.
