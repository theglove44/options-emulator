import type { Leg } from "./types";

export const DEFAULT_RISK_FREE_RATE = 0.05;

export type OptionGreekValues = {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
};

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

export function yearFraction(scenarioDate: string, expiry: string): number | null {
  const start = new Date(`${scenarioDate}T00:00:00Z`).getTime();
  const end = new Date(`${expiry}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / (365 * 24 * 60 * 60 * 1000);
}

export function calculateOptionPrice(
  leg: Pick<Leg, "type" | "strike" | "expiry">,
  underlyingPrice: number,
  volatility: number,
  scenarioDate: string,
  riskFreeRate = DEFAULT_RISK_FREE_RATE
): number | null {
  if (underlyingPrice <= 0 || leg.strike <= 0 || volatility <= 0) return null;
  const timeToExpiry = yearFraction(scenarioDate, leg.expiry);
  if (timeToExpiry == null) return null;
  if (timeToExpiry === 0) {
    return leg.type === "call"
      ? Math.max(underlyingPrice - leg.strike, 0)
      : Math.max(leg.strike - underlyingPrice, 0);
  }

  const volatilityRootTime = volatility * Math.sqrt(timeToExpiry);
  const d1 = (
    Math.log(underlyingPrice / leg.strike)
    + (riskFreeRate + (volatility * volatility) / 2) * timeToExpiry
  ) / volatilityRootTime;
  const d2 = d1 - volatilityRootTime;
  const discountFactor = Math.exp(-riskFreeRate * timeToExpiry);
  if (leg.type === "call") {
    return underlyingPrice * normalCdf(d1) - leg.strike * discountFactor * normalCdf(d2);
  }
  return leg.strike * discountFactor * normalCdf(-d2) - underlyingPrice * normalCdf(-d1);
}

function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value) / Math.sqrt(2);
  // Abramowitz and Stegun 7.1.26, accurate enough for display estimates.
  const t = 1 / (1 + 0.3275911 * magnitude);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = sign * (1 - polynomial * Math.exp(-magnitude * magnitude));
  return 0.5 * (1 + erf);
}

export function calculateOptionGreeks(
  leg: Pick<Leg, "type" | "strike" | "expiry">,
  underlyingPrice: number,
  volatility: number,
  scenarioDate: string,
  riskFreeRate = DEFAULT_RISK_FREE_RATE
): OptionGreekValues | null {
  if (underlyingPrice <= 0 || leg.strike <= 0 || volatility <= 0) return null;
  const timeToExpiry = yearFraction(scenarioDate, leg.expiry);
  if (timeToExpiry == null || timeToExpiry <= 0) return null;

  const volatilityRootTime = volatility * Math.sqrt(timeToExpiry);
  const d1 = (
    Math.log(underlyingPrice / leg.strike)
    + (riskFreeRate + (volatility * volatility) / 2) * timeToExpiry
  ) / volatilityRootTime;
  const d2 = d1 - volatilityRootTime;
  const discountFactor = Math.exp(-riskFreeRate * timeToExpiry);
  const density = normalPdf(d1);
  const isCall = leg.type === "call";

  return {
    delta: isCall ? normalCdf(d1) : normalCdf(d1) - 1,
    gamma: density / (underlyingPrice * volatilityRootTime),
    theta: (
      -(underlyingPrice * density * volatility) / (2 * Math.sqrt(timeToExpiry))
      + (isCall ? -1 : 1) * riskFreeRate * leg.strike * discountFactor * (isCall ? normalCdf(d2) : normalCdf(-d2))
    ) / 365,
    // Vega and rho are quoted per one percentage-point change.
    vega: underlyingPrice * density * Math.sqrt(timeToExpiry) / 100,
    rho: (isCall ? 1 : -1) * leg.strike * timeToExpiry * discountFactor * (isCall ? normalCdf(d2) : normalCdf(-d2)) / 100
  };
}

function normalPdf(value: number): number {
  return Math.exp(-(value * value) / 2) / Math.sqrt(2 * Math.PI);
}
