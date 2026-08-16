import type { Leg, ProfilePoint } from "./types";

export type PositionSummary = {
  legCount: number;
  netCashFlow: number;
  netDebit: number;
  netCredit: number;
};

export function summarizePosition(legs: readonly Leg[]): PositionSummary {
  const netCashFlow = legs.reduce((total, leg) => {
    const direction = leg.side === "buy" ? 1 : -1;
    return total + direction * leg.price * leg.quantity * leg.multiplier;
  }, 0);

  return {
    legCount: legs.length,
    netCashFlow,
    netDebit: Math.max(netCashFlow, 0),
    netCredit: Math.max(-netCashFlow, 0)
  };
}

export function hasUnboundedProfit(legs: readonly Leg[]): boolean {
  const callExposure = legs.reduce((total, leg) => {
    if (leg.type !== "call") return total;
    const direction = leg.side === "buy" ? 1 : -1;
    return total + direction * leg.quantity * leg.multiplier;
  }, 0);
  return callExposure > 0;
}

export function buildPositionProfile(legs: readonly Leg[], spot: number): ProfilePoint[] {
  const low = spot * 0.86;
  const high = spot * 1.14;
  const sampledPrices = Array.from({ length: 33 }, (_, index) => low + ((high - low) * index) / 32);
  const prices = [...new Set([
    ...sampledPrices,
    ...legs.map((leg) => leg.strike).filter((strike) => strike >= low && strike <= high)
  ])].sort((left, right) => left - right);

  return prices.map((price) => {
    const pnl = legs.reduce((total, leg) => {
      const intrinsic = leg.type === "call"
        ? Math.max(price - leg.strike, 0)
        : Math.max(leg.strike - price, 0);
      const direction = leg.side === "buy" ? 1 : -1;
      return total + (intrinsic - leg.price) * leg.quantity * leg.multiplier * direction;
    }, 0);
    return { price, pnl };
  });
}
