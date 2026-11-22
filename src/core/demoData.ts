export interface DemoSeedRow {
  transactionDate: string;
  description: string;
  merchant: string;
  amount: number;
  transactionType: 'CREDIT' | 'DEBIT';
}

export const DEMO_OPENING_BALANCE_INR = 65000;

export const DEMO_INDIAN_TRANSACTIONS: DemoSeedRow[] = [
  // Month 1: August 2026
  { transactionDate: '2026-08-01', description: 'SALARY CREDIT ACME TECH INDIA PVT LTD', merchant: 'Acme Tech India', amount: 85000, transactionType: 'CREDIT' },
  { transactionDate: '2026-08-03', description: 'RENT PAYMENT KORAMANGALA FLAT 4B', merchant: 'Koramangala Landlord', amount: 22000, transactionType: 'DEBIT' },
  { transactionDate: '2026-08-05', description: 'AIRTEL FIBER BROADBAND BILL', merchant: 'Airtel Fiber', amount: 999, transactionType: 'DEBIT' },
  { transactionDate: '2026-08-06', description: 'BESCOM ELECTRICITY BILL', merchant: 'BESCOM', amount: 1850, transactionType: 'DEBIT' },
  { transactionDate: '2026-08-08', description: 'SWIGGY INSTAMART GROCERIES', merchant: 'Swiggy', amount: 1420, transactionType: 'DEBIT' },
  { transactionDate: '2026-08-10', description: 'UBER INDIA OFFICE COMMUTE', merchant: 'Uber', amount: 640, transactionType: 'DEBIT' },
  { transactionDate: '2026-08-12', description: 'NETFLIX INDIA MONTHLY PLAN', merchant: 'Netflix', amount: 649, transactionType: 'DEBIT' },
  { transactionDate: '2026-08-14', description: 'ZOMATO DINNER ORDER', merchant: 'Zomato', amount: 780, transactionType: 'DEBIT' },
  { transactionDate: '2026-08-17', description: 'AMAZON PAY HOME ESSENTIALS', merchant: 'Amazon', amount: 2890, transactionType: 'DEBIT' },
  { transactionDate: '2026-08-20', description: 'APOLLO PHARMACY HEALTH CHECK', merchant: 'Apollo Pharmacy', amount: 1120, transactionType: 'DEBIT' },
  { transactionDate: '2026-08-22', description: 'RAPIDO BIKE TAXI', merchant: 'Rapido', amount: 290, transactionType: 'DEBIT' },
  { transactionDate: '2026-08-25', description: 'SWIGGY LUNCH BOWL', merchant: 'Swiggy', amount: 460, transactionType: 'DEBIT' },
  { transactionDate: '2026-08-28', description: 'FREELANCE UI CONSULTING PAYOUT', merchant: 'Design Client', amount: 14000, transactionType: 'CREDIT' },

  // Month 2: September 2026
  { transactionDate: '2026-09-01', description: 'SALARY CREDIT ACME TECH INDIA PVT LTD', merchant: 'Acme Tech India', amount: 85000, transactionType: 'CREDIT' },
  { transactionDate: '2026-09-03', description: 'RENT PAYMENT KORAMANGALA FLAT 4B', merchant: 'Koramangala Landlord', amount: 22000, transactionType: 'DEBIT' },
  { transactionDate: '2026-09-05', description: 'AIRTEL FIBER BROADBAND BILL', merchant: 'Airtel Fiber', amount: 999, transactionType: 'DEBIT' },
  { transactionDate: '2026-09-07', description: 'BESCOM ELECTRICITY BILL', merchant: 'BESCOM', amount: 1940, transactionType: 'DEBIT' },
  { transactionDate: '2026-09-09', description: 'BLINKIT WEEKLY GROCERY', merchant: 'Blinkit', amount: 1680, transactionType: 'DEBIT' },
  { transactionDate: '2026-09-11', description: 'UBER INDIA AIRPORT RIDE', merchant: 'Uber', amount: 1150, transactionType: 'DEBIT' },
  { transactionDate: '2026-09-12', description: 'NETFLIX INDIA MONTHLY PLAN', merchant: 'Netflix', amount: 649, transactionType: 'DEBIT' },
  { transactionDate: '2026-09-15', description: 'FLIPKART WORK DESK ACCESSORIES', merchant: 'Flipkart', amount: 3450, transactionType: 'DEBIT' },
  { transactionDate: '2026-09-18', description: 'ZOMATO WEEKEND ORDER', merchant: 'Zomato', amount: 940, transactionType: 'DEBIT' },
  { transactionDate: '2026-09-21', description: 'COLLEGE CERTIFICATION EXAM FEES', merchant: 'Cloud Certification', amount: 4500, transactionType: 'DEBIT' },
  { transactionDate: '2026-09-24', description: 'SWIGGY DINNER DELIVERY', merchant: 'Swiggy', amount: 520, transactionType: 'DEBIT' },
  { transactionDate: '2026-09-27', description: 'RAPIDO METRO FEEDER', merchant: 'Rapido', amount: 240, transactionType: 'DEBIT' },

  // Month 3: October 2026
  { transactionDate: '2026-10-01', description: 'SALARY CREDIT ACME TECH INDIA PVT LTD', merchant: 'Acme Tech India', amount: 85000, transactionType: 'CREDIT' },
  { transactionDate: '2026-10-03', description: 'RENT PAYMENT KORAMANGALA FLAT 4B', merchant: 'Koramangala Landlord', amount: 22000, transactionType: 'DEBIT' },
  { transactionDate: '2026-10-05', description: 'AIRTEL FIBER BROADBAND BILL', merchant: 'Airtel Fiber', amount: 999, transactionType: 'DEBIT' },
  { transactionDate: '2026-10-06', description: 'BESCOM ELECTRICITY BILL', merchant: 'BESCOM', amount: 1790, transactionType: 'DEBIT' },
  { transactionDate: '2026-10-09', description: 'SWIGGY INSTAMART GROCERIES', merchant: 'Swiggy', amount: 1560, transactionType: 'DEBIT' },
  { transactionDate: '2026-10-12', description: 'NETFLIX INDIA MONTHLY PLAN', merchant: 'Netflix', amount: 649, transactionType: 'DEBIT' },
  { transactionDate: '2026-10-14', description: 'UBER INDIA TECH PARK', merchant: 'Uber', amount: 720, transactionType: 'DEBIT' },
  { transactionDate: '2026-10-16', description: 'MYNTRA FESTIVE APPAREL', merchant: 'Myntra', amount: 4200, transactionType: 'DEBIT' },
  { transactionDate: '2026-10-19', description: 'ZOMATO FAMILY DINNER', merchant: 'Zomato', amount: 1620, transactionType: 'DEBIT' },
  { transactionDate: '2026-10-22', description: 'APOLLO PHARMACY VITAMINS', merchant: 'Apollo Pharmacy', amount: 840, transactionType: 'DEBIT' },
  { transactionDate: '2026-10-26', description: 'FREELANCE UI CONSULTING PAYOUT', merchant: 'Design Client', amount: 12000, transactionType: 'CREDIT' },

  // Month 4: November 2026 (includes intentional anomalies: large electronics spike + possible duplicate)
  { transactionDate: '2026-11-01', description: 'SALARY CREDIT ACME TECH INDIA PVT LTD', merchant: 'Acme Tech India', amount: 85000, transactionType: 'CREDIT' },
  { transactionDate: '2026-11-03', description: 'RENT PAYMENT KORAMANGALA FLAT 4B', merchant: 'Koramangala Landlord', amount: 22000, transactionType: 'DEBIT' },
  { transactionDate: '2026-11-05', description: 'AIRTEL FIBER BROADBAND BILL', merchant: 'Airtel Fiber', amount: 999, transactionType: 'DEBIT' },
  { transactionDate: '2026-11-06', description: 'BESCOM ELECTRICITY BILL', merchant: 'BESCOM', amount: 2110, transactionType: 'DEBIT' },
  { transactionDate: '2026-11-08', description: 'SWIGGY LUNCH ORDER', merchant: 'Swiggy', amount: 540, transactionType: 'DEBIT' },
  { transactionDate: '2026-11-09', description: 'THIRD WAVE COFFEE KORAMANGALA', merchant: 'Third Wave Coffee', amount: 1450, transactionType: 'DEBIT' },
  { transactionDate: '2026-11-10', description: 'THIRD WAVE COFFEE KORAMANGALA', merchant: 'Third Wave Coffee', amount: 1450, transactionType: 'DEBIT' },
  { transactionDate: '2026-11-12', description: 'NETFLIX INDIA MONTHLY PLAN', merchant: 'Netflix', amount: 649, transactionType: 'DEBIT' },
  { transactionDate: '2026-11-13', description: 'CROMA LAPTOP UPGRADE PURCHASE', merchant: 'Croma Electronics', amount: 42500, transactionType: 'DEBIT' },
  { transactionDate: '2026-11-14', description: 'ZOMATO DINNER DELIVERY', merchant: 'Zomato', amount: 890, transactionType: 'DEBIT' },
  { transactionDate: '2026-11-15', description: 'UBER INDIA CLIENT MEETING', merchant: 'Uber', amount: 580, transactionType: 'DEBIT' },
  { transactionDate: '2026-11-16', description: 'RAPIDO EVENING RIDE', merchant: 'Rapido', amount: 195, transactionType: 'DEBIT' },
];

export function generateDemoCsvString(): string {
  const header = 'Date,Description,Merchant,Amount,Type';
  const lines = DEMO_INDIAN_TRANSACTIONS.map(
    (r) => `${r.transactionDate},"${r.description}","${r.merchant}",${r.amount.toFixed(2)},${r.transactionType}`
  );
  return [header, ...lines].join('\n');
}
