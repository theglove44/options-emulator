import { calculateOptionPrice } from "./scenario";
import type { Leg, ProfilePoint } from "./types";

export type PositionSummary = {
  legCount: number;
  netCashFlow: number;
  netDebit: number;
  netCredit: number;
};

export type ObservedGreekValues = {
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
};

export type ObservedLegGreekInput = Pick<Leg, "side" | "quantity" | "multiplier"> & {
  selectedPrice: number | null;
  greeks: ObservedGreekValues | null;
};

export type PositionGreekSummary = ObservedGreekValues & {
  complete: boolean;
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

export function summarizeObservedGreeks(inputs: readonly ObservedLegGreekInput[]): PositionGreekSummary {
  const complete = inputs.length > 0 && inputs.every((input) => (
    input.selectedPrice != null
    && input.quantity > 0
    && input.multiplier > 0
    && input.greeks != null
    && Object.values(input.greeks).every((value) => value != null && Number.isFinite(value))
  ));

  if (!complete) {
    return {
      complete: false,
      delta: null,
      gamma: null,
      theta: null,
      vega: null,
      rho: null
    };
  }

  return {
    complete: true,
    delta: sumObservedGreek(inputs, "delta"),
    gamma: sumObservedGreek(inputs, "gamma"),
    theta: sumObservedGreek(inputs, "theta"),
    vega: sumObservedGreek(inputs, "vega"),
    rho: sumObservedGreek(inputs, "rho")
  };
}

function sumObservedGreek(inputs: readonly ObservedLegGreekInput[], key: keyof ObservedGreekValues): number {
  return inputs.reduce((total, input) => {
    const direction = input.side === "buy" ? 1 : -1;
    return total + (input.greeks?.[key] ?? 0) * input.quantity * input.multiplier * direction;
  }, 0);
}

export function hasUnboundedProfit(legs: readonly Leg[]): boolean {
  const callExposure = legs.reduce((total, leg) => {
    if (leg.type !== "call") return total;
    const direction = leg.side === "buy" ? 1 : -1;
    return total + direction * leg.quantity * leg.multiplier;
  }, 0);
  return callExposure > 0;
}

export function buildPositionProfile(legs: readonly Leg[], spot: number, rangePercent = 0.14): ProfilePoint[] {
  const low = spot * (1 - rangePercent);
  const high = spot * (1 + rangePercent);
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

export type PreExpiryLegInput = {
  leg: Leg;
  volatility: number | null;
};

export function calculatePreExpiryPnl(
  inputs: readonly PreExpiryLegInput[],
  underlyingPrice: number,
  scenarioDate: string
): number | null {
  if (!inputs.length) return null;
  let total = 0;
  for (const input of inputs) {
    if (!input.leg.priceLoaded || input.volatility == null) return null;
    const value = calculateOptionPrice(input.leg, underlyingPrice, input.volatility, scenarioDate);
    if (value == null) return null;
    const direction = input.leg.side === "buy" ? 1 : -1;
    total += (value - input.leg.price) * input.leg.quantity * input.leg.multiplier * direction;
  }
  return total;
}

export function buildPreExpiryProfile(
  inputs: readonly PreExpiryLegInput[],
  spot: number,
  scenarioDate: string,
  rangePercent = 0.14
): ProfilePoint[] {
  if (spot <= 0 || !inputs.length) return [];
  const low = spot * (1 - rangePercent);
  const high = spot * (1 + rangePercent);
  const sampledPrices = Array.from({ length: 33 }, (_, index) => low + ((high - low) * index) / 32);
  const prices = [...new Set([
    ...sampledPrices,
    ...inputs.map(({ leg }) => leg.strike).filter((strike) => strike >= low && strike <= high)
  ])].sort((left, right) => left - right);
  return prices.flatMap((price) => {
    const pnl = calculatePreExpiryPnl(inputs, price, scenarioDate);
    return pnl == null ? [] : [{ price, pnl }];
  });
}
