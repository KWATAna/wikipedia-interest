/** Keep the sign of small nonzero changes visible after rounding. */
export function formatPercent(value: number | null, missing = 'n/a'): string {
  if (value === null || !Number.isFinite(value)) return missing;
  let digits = 1;
  while (value !== 0 && digits < 6 && Number(value.toFixed(digits)) === 0) digits++;
  const formatted = value !== 0 && Number(value.toFixed(digits)) === 0
    ? value.toExponential(1) : value.toFixed(digits);
  return `${value >= 0 ? '+' : ''}${formatted}%`;
}
