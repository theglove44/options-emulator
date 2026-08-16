import type { ChainExpiration, OptionContract } from "./api";
import type { Leg, OptionType, Side } from "./types";

export type StrikeRole = "anchor" | "lower" | "upper" | "far-lower" | "far-upper";
export type ExpiryRole = "near" | "far";

export type StrategyTemplateLeg = {
  side: Side;
  type: OptionType;
  strikeRole: StrikeRole;
  expiryRole?: ExpiryRole;
};

export type StrategyTemplate = {
  id: string;
  label: string;
  legs: readonly StrategyTemplateLeg[];
};

// Keep the registry explicit: each supported template names its canonical legs
// and only the UI resolves those legs to contracts from the loaded chain.
export const STRATEGY_TEMPLATES = {
  "long-call": {
    id: "long-call",
    label: "Long Call",
    legs: [{ side: "buy", type: "call", strikeRole: "anchor" }]
  },
  "short-call": {
    id: "short-call",
    label: "Short Call",
    legs: [{ side: "sell", type: "call", strikeRole: "anchor" }]
  },
  "long-put": {
    id: "long-put",
    label: "Long Put",
    legs: [{ side: "buy", type: "put", strikeRole: "anchor" }]
  },
  "short-put": {
    id: "short-put",
    label: "Short Put",
    legs: [{ side: "sell", type: "put", strikeRole: "anchor" }]
  },
  "call-credit-spread": {
    id: "call-credit-spread",
    label: "Call Credit Spread",
    legs: [
      { side: "sell", type: "call", strikeRole: "anchor" },
      { side: "buy", type: "call", strikeRole: "upper" }
    ]
  },
  "put-credit-spread": {
    id: "put-credit-spread",
    label: "Put Credit Spread",
    legs: [
      { side: "sell", type: "put", strikeRole: "anchor" },
      { side: "buy", type: "put", strikeRole: "lower" }
    ]
  },
  straddle: {
    id: "straddle",
    label: "Long Straddle",
    legs: [
      { side: "buy", type: "call", strikeRole: "anchor" },
      { side: "buy", type: "put", strikeRole: "anchor" }
    ]
  },
  strangle: {
    id: "strangle",
    label: "Long Strangle",
    legs: [
      { side: "buy", type: "put", strikeRole: "lower" },
      { side: "buy", type: "call", strikeRole: "upper" }
    ]
  },
  "short-strangle": {
    id: "short-strangle",
    label: "Short Strangle",
    legs: [
      { side: "sell", type: "put", strikeRole: "lower" },
      { side: "sell", type: "call", strikeRole: "upper" }
    ]
  },
  "calendar-spread": {
    id: "calendar-spread",
    label: "Calendar Spread",
    legs: [
      { side: "sell", type: "call", strikeRole: "anchor", expiryRole: "near" },
      { side: "buy", type: "call", strikeRole: "anchor", expiryRole: "far" }
    ]
  },
  "diagonal-spread": {
    id: "diagonal-spread",
    label: "Diagonal Spread",
    legs: [
      { side: "sell", type: "call", strikeRole: "upper", expiryRole: "near" },
      { side: "buy", type: "call", strikeRole: "anchor", expiryRole: "far" }
    ]
  },
  "iron-condor": {
    id: "iron-condor",
    label: "Iron Condor",
    legs: [
      { side: "buy", type: "put", strikeRole: "far-lower" },
      { side: "sell", type: "put", strikeRole: "lower" },
      { side: "sell", type: "call", strikeRole: "upper" },
      { side: "buy", type: "call", strikeRole: "far-upper" }
    ]
  }
} as const satisfies Record<string, StrategyTemplate>;

export type StrategyTemplateId = keyof typeof STRATEGY_TEMPLATES;

export const DEFAULT_STRATEGY_TEMPLATE_ID: StrategyTemplateId = "long-call";

const STRIKE_ROLE_OFFSETS: Record<StrikeRole, number> = {
  "far-lower": -2,
  lower: -1,
  anchor: 0,
  upper: 1,
  "far-upper": 2
};

export function getStrategyTemplate(id: StrategyTemplateId) {
  return STRATEGY_TEMPLATES[id];
}

export function templateForLeg(leg: Pick<Leg, "side" | "type">) {
  const duration = leg.side === "buy" ? "long" : "short";
  return getStrategyTemplate(`${duration}-${leg.type}` as StrategyTemplateId);
}

export function resolveStrategyTemplateContracts(
  expiry: ChainExpiration,
  template: StrategyTemplate,
  anchorStrike: number
): OptionContract[] | null {
  return resolveStrategyTemplateContractsForExpiries(
    template.legs.map(() => expiry),
    template,
    anchorStrike
  );
}

export function resolveStrategyTemplateContractsForChain(
  expirations: readonly ChainExpiration[],
  template: StrategyTemplate,
  anchorStrike: number,
  nearExpiryDate?: string
): OptionContract[] | null {
  const nearExpiry = expirations.find((item) => item.expiration_date === nearExpiryDate) ?? expirations[0];
  if (!nearExpiry) return null;
  const farExpiry = expirations.find((item) => item.expiration_date > nearExpiry.expiration_date);
  const selectedExpiries = template.legs.map((spec) => spec.expiryRole === "far" ? farExpiry : nearExpiry);
  if (selectedExpiries.some((expiry): expiry is undefined => expiry === undefined)) return null;
  return resolveStrategyTemplateContractsForExpiries(selectedExpiries as ChainExpiration[], template, anchorStrike);
}

function resolveStrategyTemplateContractsForExpiries(
  expiries: readonly ChainExpiration[],
  template: StrategyTemplate,
  anchorStrike: number
): OptionContract[] | null {
  const matchingByLeg = template.legs.map((spec, index) => expiries[index].contracts
    .filter((contract) => contract.active && contract.option_type === spec.type)
    .sort((left, right) => left.strike - right.strike));
  const strikesByRole = new Map<StrikeRole, number[]>();
  template.legs.forEach((spec, index) => {
    const strikes = [...new Set(matchingByLeg[index].map((contract) => contract.strike))];
    const existing = strikesByRole.get(spec.strikeRole);
    strikesByRole.set(spec.strikeRole, existing ? existing.filter((strike) => strikes.includes(strike)) : strikes);
  });
  if ([...strikesByRole.values()].some((strikes) => strikes.length === 0)) return null;

  const contracts = template.legs.map((spec, index) => {
    const strikes = strikesByRole.get(spec.strikeRole);
    if (!strikes?.length) return null;
    const anchorIndex = strikes.reduce(
      (nearest, strike, index) => Math.abs(strike - anchorStrike) < Math.abs(strikes[nearest] - anchorStrike) ? index : nearest,
      0
    );
    const strikeIndex = anchorIndex + STRIKE_ROLE_OFFSETS[spec.strikeRole];
    if (strikeIndex < 0 || strikeIndex >= strikes.length) return null;
    return matchingByLeg[index].find((contract) => contract.strike === strikes[strikeIndex]) ?? null;
  });
  if (contracts.some((contract): contract is null => contract === null)) return null;

  const resolved = contracts as OptionContract[];
  for (let left = 0; left < resolved.length; left += 1) {
    for (let right = left + 1; right < resolved.length; right += 1) {
      const leftSpec = template.legs[left];
      const rightSpec = template.legs[right];
      if (leftSpec.strikeRole === rightSpec.strikeRole) {
        if (resolved[left].strike !== resolved[right].strike) return null;
        continue;
      }
      if (resolved[left].strike === resolved[right].strike) return null;
      const leftOffset = STRIKE_ROLE_OFFSETS[leftSpec.strikeRole];
      const rightOffset = STRIKE_ROLE_OFFSETS[rightSpec.strikeRole];
      if (leftOffset < rightOffset && resolved[left].strike >= resolved[right].strike) return null;
      if (leftOffset > rightOffset && resolved[left].strike <= resolved[right].strike) return null;
    }
  }
  return resolved;
}
