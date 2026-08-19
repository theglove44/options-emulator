import { calculateOptionGreeks, calculateOptionPrice } from "./scenario";
import type { OptionGreekValues } from "./scenario";
import type { Leg, ProfilePoint } from "./types";

export type PositionSummary = {
  legCount: number;
  netCashFlow: number;
  netDebit: number;
  netCredit: number;
  entryCommission: number;
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

export type ModelledLegGreekInput = {
  leg: Leg;
  volatility: number | null;
};

export type ModelledGreekSummary = ObservedGreekValues & {
  complete: boolean;
};

export function summarizePosition(legs: readonly Leg[], commissionPerContract = 0): PositionSummary {
  assertCommission(commissionPerContract);
  const netCashFlow = legs.reduce((total, leg) => {
    const direction = leg.side === "buy" ? 1 : -1;
    return total + direction * leg.price * leg.quantity * leg.multiplier;
  }, 0) + calculateCommission(legs, commissionPerContract);

  return {
    legCount: legs.length,
    netCashFlow,
    netDebit: Math.max(netCashFlow, 0),
    netCredit: Math.max(-netCashFlow, 0),
    entryCommission: calculateCommission(legs, commissionPerContract)
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

export function summarizeModelledGreeks(
  inputs: readonly ModelledLegGreekInput[],
  underlyingPrice: number,
  scenarioDate: string
): ModelledGreekSummary {
  const values = inputs.map((input) => calculateOptionGreeks(
    input.leg,
    underlyingPrice,
    input.volatility ?? 0,
    scenarioDate
  ));
  const complete = inputs.length > 0 && values.every((value) => (
    value != null && Object.values(value).every((item) => Number.isFinite(item))
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
    delta: sumModelledGreek(inputs, values, "delta"),
    gamma: sumModelledGreek(inputs, values, "gamma"),
    theta: sumModelledGreek(inputs, values, "theta"),
    vega: sumModelledGreek(inputs, values, "vega"),
    rho: sumModelledGreek(inputs, values, "rho")
  };
}

function sumObservedGreek(inputs: readonly ObservedLegGreekInput[], key: keyof ObservedGreekValues): number {
  return inputs.reduce((total, input) => {
    const direction = input.side === "buy" ? 1 : -1;
    return total + (input.greeks?.[key] ?? 0) * input.quantity * input.multiplier * direction;
  }, 0);
}

function sumModelledGreek(
  inputs: readonly ModelledLegGreekInput[],
  values: readonly (OptionGreekValues | null)[],
  key: keyof OptionGreekValues
): number {
  return inputs.reduce((total, input, index) => {
    const direction = input.leg.side === "buy" ? 1 : -1;
    return total + (values[index]?.[key] ?? 0) * input.leg.quantity * input.leg.multiplier * direction;
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

export function buildPositionProfile(
  legs: readonly Leg[],
  spot: number,
  rangePercent = 0.14,
  commissionPerContract = 0
): ProfilePoint[] {
  assertCommission(commissionPerContract);
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
      return total
        + (intrinsic - leg.price) * leg.quantity * leg.multiplier * direction
        - commissionPerContract * leg.quantity * 2;
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
  scenarioDate: string,
  commissionPerContract = 0
): number | null {
  assertCommission(commissionPerContract);
  if (!inputs.length) return null;
  let total = 0;
  for (const input of inputs) {
    if (!input.leg.priceLoaded || input.volatility == null) return null;
    const value = calculateOptionPrice(input.leg, underlyingPrice, input.volatility, scenarioDate);
    if (value == null) return null;
    const direction = input.leg.side === "buy" ? 1 : -1;
    total += (value - input.leg.price) * input.leg.quantity * input.leg.multiplier * direction
      - commissionPerContract * input.leg.quantity * 2;
  }
  return total;
}

function calculateCommission(legs: readonly Leg[], commissionPerContract: number): number {
  return legs.reduce((total, leg) => total + commissionPerContract * leg.quantity, 0);
}

function assertCommission(commissionPerContract: number): void {
  if (!Number.isFinite(commissionPerContract) || commissionPerContract < 0) {
    throw new Error("commissionPerContract must be a finite non-negative number");
  }
}

export function buildPreExpiryProfile(
  inputs: readonly PreExpiryLegInput[],
  spot: number,
  scenarioDate: string,
  rangePercent = 0.14,
  commissionPerContract = 0
): ProfilePoint[] {
  assertCommission(commissionPerContract);
  if (spot <= 0 || !inputs.length) return [];
  const low = spot * (1 - rangePercent);
  const high = spot * (1 + rangePercent);
  const sampledPrices = Array.from({ length: 33 }, (_, index) => low + ((high - low) * index) / 32);
  const prices = [...new Set([
    ...sampledPrices,
    ...inputs.map(({ leg }) => leg.strike).filter((strike) => strike >= low && strike <= high)
  ])].sort((left, right) => left - right);
  return prices.flatMap((price) => {
    const pnl = calculatePreExpiryPnl(inputs, price, scenarioDate, commissionPerContract);
    return pnl == null ? [] : [{ price, pnl }];
  });
}
