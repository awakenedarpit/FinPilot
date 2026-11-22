export function formatCurrency(amount: number | null | undefined, currency = 'INR'): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '—';
  }
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatCompactCurrency(amount: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (currency === 'INR') {
    if (abs >= 10000000) return `${sign}${symbol}${(abs / 10000000).toFixed(2)}Cr`;
    if (abs >= 100000) return `${sign}${symbol}${(abs / 100000).toFixed(2)}L`;
    if (abs >= 1000) return `${sign}${symbol}${(abs / 1000).toFixed(1)}k`;
  } else {
    if (abs >= 1000000) return `${sign}${symbol}${(abs / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${sign}${symbol}${(abs / 1000).toFixed(1)}k`;
  }
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
