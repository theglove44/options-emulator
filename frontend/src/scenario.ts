export function parseVolatilityPercent(value: string): number | null {
  if (!value.trim()) return null;
  const percentage = Number(value);
  if (!Number.isFinite(percentage) || percentage <= 0) return null;
  return percentage / 100;
}

export function formatVolatilityPercent(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function clampScenarioDate(value: string, minimum: string, maximum: string): string {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}
