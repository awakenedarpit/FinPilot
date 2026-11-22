# FinPilot AI — Demo & Evaluation Guide

## 1. Exploring the Synthetic INR Demo Workspace
1. Open the app and click **Try Interactive Demo** or **Open Demo Workspace** (or append `?autostart=1` to the URL).
2. The sandbox loads a 4-month synthetic Indian salaried profile (`₹3,66,000` income, `₹1,78,907` expenses, `₹65,000` opening balance) with realistic merchants (Swiggy, Zomato, BESCOM, Airtel Fiber, Uber, Rapido, Flipkart, Croma Electronics, Koramangala Landlord).
3. All demo views display a `DEMO` indicator in the top bar so synthetic figures are never confused with personal banking records.

## 2. Suggested Verification Walkthrough
- **Overview**: Inspect KPI cards (Recorded Balance, Total Income, Total Expenses, Net Cash Flow, Monthly Savings Rate), monthly trend bar chart, top spending categories, and recurring commitments.
- **Transactions & CSV Preview**:
  - Open **Import CSV**, click **Load & Preview Sample Indian CSV** (or upload `/sample-data/demo-transactions.csv`), inspect valid/duplicate/invalid counts, and note SHA-256 deduplication.
  - Edit any transaction's category inline (marks classification as `user_override`) or click **Add Manual Entry** to create a transaction.
- **Analytics**: Review full category breakdown, merchant concentration, and recurring commitment detection.
- **Forecasts & Scenario Simulation**:
  - Inspect EWMA + recurring expense projections, uncertainty range, and holdout MAPE backtest.
  - Adjust **Target Category** (`Shopping`), **Category Change** (`-15%`), or **Additional Monthly Expense** to verify deterministic monthly/annual savings deltas.
  - Review MAD/IQR anomaly alerts (unusual Croma Electronics spend and 48h duplicate Blue Tokai Coffee alert—explicitly never labeled "fraud").
- **AI Copilot**: Ask `"Where did most of my money go?"`, `"What if I reduce my shopping expenses by 15%?"`, or `"Are there any unusual transactions?"` to see tool execution metadata and hairline evidence rows.
- **Settings**: Update reporting currency or opening balance, test Light/Dark theme switching, or inspect the Account Aggregator status (`not_enabled`).
