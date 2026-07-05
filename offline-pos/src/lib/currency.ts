export function getCurrencySymbol(currency?: string): string {
  const curr = currency || 'BDT';
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    const currencyPart = parts.find(p => p.type === 'currency');
    return currencyPart ? currencyPart.value : curr;
  } catch (e) {
    return curr;
  }
}

export function formatCurrency(value: number | undefined | null, currency?: string): string {
  if (value === undefined || value === null) return '—';
  const curr = currency || 'BDT';
  const symbol = getCurrencySymbol(curr);
  const formattedNumber = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return `${symbol} ${formattedNumber}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
