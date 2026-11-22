import type { ClassificationResult, TransactionType } from './types.ts';

interface MerchantRule {
  patterns: RegExp[];
  category: string;
  subcategory: string;
  confidence: number;
}

const MERCHANT_RULES: MerchantRule[] = [
  {
    patterns: [/\bswiggy\b/i, /\bzomato\b/i, /\beatsure\b/i, /\bdominos\b/i, /\bmcdonalds\b/i],
    category: 'Food',
    subcategory: 'Food Delivery',
    confidence: 0.94,
  },
  {
    patterns: [/\bblinkit\b/i, /\bzepto\b/i, /\bbigbasket\b/i, /\binstamart\b/i, /\bdmart\b/i, /\bgrocery\b/i, /\bstarbucks\b/i, /\bthird wave\b/i, /\bcafe\b/i, /\brestaurant\b/i],
    category: 'Food',
    subcategory: 'Groceries & Dining',
    confidence: 0.91,
  },
  {
    patterns: [/\buber\b/i, /\bola\b/i, /\brapido\b/i, /\bmetro\b/i, /\birctc\b/i, /\bindigo\b/i, /\bfuel\b/i, /\bpetrol\b/i, /\biocl\b/i, /\bbpcl\b/i, /\bfastag\b/i],
    category: 'Transport',
    subcategory: 'Commute & Travel',
    confidence: 0.93,
  },
  {
    patterns: [/\bamazon\b/i, /\bflipkart\b/i, /\bmyntra\b/i, /\bnykaa\b/i, /\bajio\b/i, /\bcroma\b/i, /\breliance digital\b/i, /\bdecathlon\b/i],
    category: 'Shopping',
    subcategory: 'Retail & E-Commerce',
    confidence: 0.9,
  },
  {
    patterns: [/\brent\b/i, /\bnobroker\b/i, /\bcred rent\b/i, /\bmaintenance\b/i, /\bpg accommodation\b/i, /\bhostel\b/i],
    category: 'Housing',
    subcategory: 'Rent & Housing',
    confidence: 0.95,
  },
  {
    patterns: [/\belectricity\b/i, /\bbescom\b/i, /\btata power\b/i, /\bmahavitaran\b/i, /\bjio\b/i, /\bairtel\b/i, /\bact fibernet\b/i, /\bwater bill\b/i, /\bgas bill\b/i, /\bbroadband\b/i, /\brecharge\b/i],
    category: 'Utilities',
    subcategory: 'Bills & Telecom',
    confidence: 0.93,
  },
  {
    patterns: [/\bapollo\b/i, /\bpharmeasy\b/i, /\b1mg\b/i, /\bpracto\b/i, /\bhospital\b/i, /\bclinic\b/i, /\bpharmacy\b/i, /\bdiagnostic\b/i, /\bmedplus\b/i],
    category: 'Healthcare',
    subcategory: 'Medical & Pharmacy',
    confidence: 0.92,
  },
  {
    patterns: [/\bcollege\b/i, /\btuition\b/i, /\buniversity\b/i, /\bcoursera\b/i, /\budemy\b/i, /\bexam fee\b/i, /\bbooks\b/i, /\bcertification\b/i],
    category: 'Education',
    subcategory: 'Fees & Learning',
    confidence: 0.92,
  },
  {
    patterns: [/\bnetflix\b/i, /\bspotify\b/i, /\bprime video\b/i, /\bhotstar\b/i, /\bbookmyshow\b/i, /\bpvr\b/i, /\binox\b/i, /\byoutube\b/i, /\bsteam\b/i],
    category: 'Entertainment',
    subcategory: 'Streaming & Events',
    confidence: 0.92,
  },
  {
    patterns: [/\bsalary\b/i, /\bpayroll\b/i, /\bstipend\b/i, /\bmonthly pay\b/i],
    category: 'Salary',
    subcategory: 'Primary Compensation',
    confidence: 0.96,
  },
  {
    patterns: [/\bfreelance\b/i, /\bconsulting\b/i, /\binvoice\b/i, /\bupwork\b/i, /\bfiverr\b/i, /\bretainer\b/i],
    category: 'Freelance Income',
    subcategory: 'Client Income',
    confidence: 0.9,
  },
  {
    patterns: [/\bself transfer\b/i, /\bsavings transfer\b/i, /\bmutual fund\b/i, /\bsip\b/i, /\bzerodha\b/i, /\bgroww\b/i, /\bupi transfer\b/i, /\bneft\b/i, /\bimps\b/i],
    category: 'Transfers',
    subcategory: 'Account Transfers & SIP',
    confidence: 0.85,
  },
];

// Lightweight labelled training corpus for Naive Bayes fallback when deterministic merchant rules don't match
const TRAINING_CORPUS: Array<{ text: string; category: string }> = [
  { text: 'bakery lunch dinner breakfast tiffin canteen coffee mess', category: 'Food' },
  { text: 'biryani snacks burger pizza tea juice supermarket', category: 'Food' },
  { text: 'cab auto bus train ticket flight parking toll', category: 'Transport' },
  { text: 'apparel shoes electronics watch backpack accessories mall', category: 'Shopping' },
  { text: 'apartment lease flat deposit society water', category: 'Housing' },
  { text: 'power wifi fiber internet postpaid mobile cylinder', category: 'Utilities' },
  { text: 'doctor dental checkup medicine lab test', category: 'Healthcare' },
  { text: 'course workshop textbook library semester', category: 'Education' },
  { text: 'movie concert gaming subscription music', category: 'Entertainment' },
  { text: 'bonus reimbursement salary credit employer', category: 'Salary' },
  { text: 'client project design payout settlement', category: 'Freelance Income' },
  { text: 'transfer wallet neft rtgs', category: 'Transfers' },
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

const classTokenCounts = new Map<string, Map<string, number>>();
const classTotals = new Map<string, number>();
const vocabulary = new Set<string>();

for (const sample of TRAINING_CORPUS) {
  const tokens = tokenize(sample.text);
  if (!classTokenCounts.has(sample.category)) {
    classTokenCounts.set(sample.category, new Map());
    classTotals.set(sample.category, 0);
  }
  const counts = classTokenCounts.get(sample.category)!;
  for (const token of tokens) {
    vocabulary.add(token);
    counts.set(token, (counts.get(token) ?? 0) + 1);
    classTotals.set(sample.category, (classTotals.get(sample.category) ?? 0) + 1);
  }
}

export function normalizeMerchantName(description: string, explicitMerchant?: string | null): string {
  if (explicitMerchant && explicitMerchant.trim().length > 0) {
    return explicitMerchant
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 60);
  }

  let cleaned = description
    .replace(/^(upi|imps|neft|rtgs|pos|ecom|bil|ach|ecs)[-/:\s]+/i, '')
    .replace(/\b\d{6,}\b/g, '')
    .replace(/[@/][a-z0-9._-]+/gi, ' ')
    .replace(/[^a-zA-Z0-9\s&'.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    cleaned = description.trim().slice(0, 48) || 'Unknown Merchant';
  }

  const words = cleaned.split(' ').slice(0, 4);
  return words
    .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
    .join(' ');
}

function classifyWithNaiveBayes(text: string): { category: string; confidence: number } | null {
  const tokens = tokenize(text);
  if (tokens.length === 0 || vocabulary.size === 0) return null;

  const categories = Array.from(classTokenCounts.keys());
  const vocabSize = vocabulary.size;
  let matchedAnyToken = false;

  const scores: Array<{ category: string; logProb: number }> = [];

  for (const cat of categories) {
    const counts = classTokenCounts.get(cat)!;
    const total = classTotals.get(cat) ?? 0;
    let logProb = Math.log(1 / categories.length);
    for (const token of tokens) {
      if (counts.has(token)) matchedAnyToken = true;
      const count = counts.get(token) ?? 0;
      logProb += Math.log((count + 1) / (total + vocabSize));
    }
    scores.push({ category: cat, logProb });
  }

  if (!matchedAnyToken) return null;

  scores.sort((a, b) => b.logProb - a.logProb);
  const maxLog = scores[0].logProb;
  const exps = scores.map((s) => Math.exp(s.logProb - maxLog));
  const sumExps = exps.reduce((acc, v) => acc + v, 0);
  const prob = exps[0] / sumExps;

  if (prob < 0.25) return null;

  // Cap Naive Bayes confidence realistically between 0.55 and 0.82
  const calibrated = Math.min(0.82, Math.max(0.55, Number(prob.toFixed(3))));
  return { category: scores[0].category, confidence: calibrated };
}

export function classifyTransaction(
  description: string,
  transactionType: TransactionType,
  explicitMerchant?: string | null
): ClassificationResult {
  const combined = `${description} ${explicitMerchant ?? ''}`.trim();
  const normalizedMerchant = normalizeMerchantName(description, explicitMerchant);

  for (const rule of MERCHANT_RULES) {
    if (rule.patterns.some((p) => p.test(combined))) {
      // Avoid classifying a refund or credit as Salary unless it actually matches Salary/Freelance
      if (
        transactionType === 'CREDIT' &&
        rule.category !== 'Salary' &&
        rule.category !== 'Freelance Income' &&
        rule.category !== 'Transfers'
      ) {
        return {
          category: 'Transfers',
          subcategory: `Refund / Reversal (${rule.category})`,
          confidence: 0.72,
          method: 'credit_income_rule',
          normalizedMerchant,
        };
      }
      return {
        category: rule.category,
        subcategory: rule.subcategory,
        confidence: rule.confidence,
        method: 'merchant_rule',
        normalizedMerchant,
      };
    }
  }

  const mlGuess = classifyWithNaiveBayes(combined);
  if (mlGuess) {
    if (
      transactionType === 'CREDIT' &&
      mlGuess.category !== 'Salary' &&
      mlGuess.category !== 'Freelance Income' &&
      mlGuess.category !== 'Transfers'
    ) {
      return {
        category: 'Freelance Income',
        subcategory: 'Unclassified Credit',
        confidence: 0.58,
        method: 'credit_income_rule',
        normalizedMerchant,
      };
    }
    return {
      category: mlGuess.category,
      subcategory: null,
      confidence: mlGuess.confidence,
      method: 'ml_naive_bayes',
      normalizedMerchant,
    };
  }

  if (transactionType === 'CREDIT') {
    return {
      category: 'Freelance Income',
      subcategory: 'General Credit',
      confidence: 0.5,
      method: 'credit_income_rule',
      normalizedMerchant,
    };
  }

  return {
    category: 'Other',
    subcategory: null,
    confidence: 0.45,
    method: 'fallback',
    normalizedMerchant,
  };
}
