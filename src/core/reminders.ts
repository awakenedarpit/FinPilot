import type {
  PaymentReminderRecord,
  RecurringCandidate,
  ReminderRecurrence,
  ReminderSummary,
  ReminderUrgency,
} from './types.ts';

function parseIsoDateUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function formatUtcIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getTodayIsoDate(refDate: Date = new Date()): string {
  return formatUtcIso(
    new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate()))
  );
}

export function addDaysToIsoDate(dateStr: string, days: number): string {
  const d = parseIsoDateUtc(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatUtcIso(d);
}

/**
 * Advances a YYYY-MM-DD due date to the next cycle according to recurrence,
 * clamping month-end days cleanly (e.g. Jan 31 -> Feb 28).
 */
export function computeNextRecurrenceDate(
  dueDate: string,
  recurrence: ReminderRecurrence
): string {
  if (recurrence === 'ONCE') return dueDate;
  const [year, month, day] = dueDate.split('-').map(Number);
  const monthsToAdd = recurrence === 'MONTHLY' ? 1 : recurrence === 'QUARTERLY' ? 3 : 12;

  const targetMonthIndex = (month - 1) + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  const maxDayInMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDayInMonth);

  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function evaluateReminderUrgency(
  reminder: Pick<PaymentReminderRecord, 'dueDate' | 'status' | 'remindDaysBefore'>,
  referenceDateStr: string = getTodayIsoDate()
): { urgency: ReminderUrgency; daysUntilDue: number | null } {
  if (reminder.status === 'PAID') {
    return { urgency: 'PAID', daysUntilDue: null };
  }
  if (reminder.status === 'DISMISSED') {
    return { urgency: 'DISMISSED', daysUntilDue: null };
  }

  const dueUtc = parseIsoDateUtc(reminder.dueDate).getTime();
  const refUtc = parseIsoDateUtc(referenceDateStr).getTime();
  const daysUntilDue = Math.round((dueUtc - refUtc) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0) {
    return { urgency: 'OVERDUE', daysUntilDue };
  }
  if (daysUntilDue === 0) {
    return { urgency: 'DUE_TODAY', daysUntilDue: 0 };
  }
  if (daysUntilDue <= Math.max(0, reminder.remindDaysBefore)) {
    return { urgency: 'DUE_SOON', daysUntilDue };
  }
  return { urgency: 'UPCOMING', daysUntilDue };
}

const URGENCY_ORDER: Record<ReminderUrgency, number> = {
  OVERDUE: 0,
  DUE_TODAY: 1,
  DUE_SOON: 2,
  UPCOMING: 3,
  PAID: 4,
  DISMISSED: 5,
};

export function enrichAndSortReminders(
  reminders: PaymentReminderRecord[],
  referenceDateStr: string = getTodayIsoDate()
): PaymentReminderRecord[] {
  return reminders
    .map((r) => {
      const { urgency, daysUntilDue } = evaluateReminderUrgency(r, referenceDateStr);
      return { ...r, urgency, daysUntilDue };
    })
    .sort((a, b) => {
      const rankA = URGENCY_ORDER[a.urgency ?? 'UPCOMING'];
      const rankB = URGENCY_ORDER[b.urgency ?? 'UPCOMING'];
      if (rankA !== rankB) return rankA - rankB;
      return a.dueDate.localeCompare(b.dueDate);
    });
}

export function summarizeReminderNotifications(
  reminders: PaymentReminderRecord[],
  referenceDateStr: string = getTodayIsoDate()
): ReminderSummary {
  const enriched = enrichAndSortReminders(reminders, referenceDateStr);
  let overdueCount = 0;
  let dueTodayCount = 0;
  let dueSoonCount = 0;
  let totalPendingCount = 0;
  let totalPendingAmount = 0;
  const urgentReminders: PaymentReminderRecord[] = [];

  for (const r of enriched) {
    if (r.status === 'PENDING') {
      totalPendingCount++;
      totalPendingAmount += r.amount;
    }
    if (r.urgency === 'OVERDUE') {
      overdueCount++;
      urgentReminders.push(r);
    } else if (r.urgency === 'DUE_TODAY') {
      dueTodayCount++;
      urgentReminders.push(r);
    } else if (r.urgency === 'DUE_SOON') {
      dueSoonCount++;
      urgentReminders.push(r);
    }
  }

  return {
    overdueCount,
    dueTodayCount,
    dueSoonCount,
    activeAlertCount: overdueCount + dueTodayCount + dueSoonCount,
    totalPendingCount,
    totalPendingAmount: Number(totalPendingAmount.toFixed(2)),
    urgentReminders,
  };
}

export function buildDemoReminders(referenceDateStr: string = getTodayIsoDate()): Array<{
  title: string;
  reminderType: PaymentReminderRecord['reminderType'];
  merchant: string;
  categoryName: string;
  amount: number;
  dueDate: string;
  recurrence: ReminderRecurrence;
  remindDaysBefore: number;
  notes: string;
}> {
  return [
    {
      title: 'HDFC Consumer Electronics EMI (Month 2/6)',
      reminderType: 'EMI',
      merchant: 'HDFC Bank EMI',
      categoryName: 'Shopping',
      amount: 7083,
      dueDate: addDaysToIsoDate(referenceDateStr, -1),
      recurrence: 'MONTHLY',
      remindDaysBefore: 5,
      notes: 'No-cost EMI installment for laptop/electronics purchase.',
    },
    {
      title: 'Koramangala Apartment Monthly Rent',
      reminderType: 'BILL',
      merchant: 'Koramangala Landlord',
      categoryName: 'Housing',
      amount: 22000,
      dueDate: addDaysToIsoDate(referenceDateStr, 2),
      recurrence: 'MONTHLY',
      remindDaysBefore: 5,
      notes: 'Monthly NEFT/UPI rent transfer due before the 5th.',
    },
    {
      title: 'Airtel Fiber Broadband Bill',
      reminderType: 'SUBSCRIPTION',
      merchant: 'Airtel Fiber',
      categoryName: 'Utilities',
      amount: 1179,
      dueDate: addDaysToIsoDate(referenceDateStr, 4),
      recurrence: 'MONTHLY',
      remindDaysBefore: 5,
      notes: 'Auto-reminder for broadband invoice.',
    },
    {
      title: 'BESCOM Electricity Bill',
      reminderType: 'BILL',
      merchant: 'BESCOM',
      categoryName: 'Utilities',
      amount: 1850,
      dueDate: addDaysToIsoDate(referenceDateStr, 10),
      recurrence: 'MONTHLY',
      remindDaysBefore: 4,
      notes: 'Monthly utility bill cycle.',
    },
  ];
}

export function buildRemindersFromRecurringCandidates(
  candidates: RecurringCandidate[],
  existingReminders: PaymentReminderRecord[]
) {
  const existingMerchants = new Set(
    existingReminders
      .map((r) => (r.merchant || r.title).toLowerCase().trim())
      .filter(Boolean)
  );

  return candidates
    .filter((c) => !existingMerchants.has(c.merchant.toLowerCase().trim()))
    .map((c) => ({
      title: `${c.merchant} (${c.category})`,
      reminderType: (c.category === 'Entertainment' || c.category === 'Utilities'
        ? 'SUBSCRIPTION'
        : 'BILL') as PaymentReminderRecord['reminderType'],
      merchant: c.merchant,
      categoryName: c.category,
      amount: Math.round(c.averageAmount * 100) / 100,
      dueDate: c.nextEstimatedDate,
      recurrence: 'MONTHLY' as ReminderRecurrence,
      remindDaysBefore: 4,
      notes: `Auto-detected ~${c.cadenceDays}-day recurring commitment (${c.occurrences} observed debits).`,
    }));
}
