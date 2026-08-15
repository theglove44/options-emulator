import type { Leg, OptionType, Side } from "./types";

export type StrategyTemplate = {
  id: string;
  label: string;
  side: Side;
  type: OptionType;
};

// Keep this registry deliberately small. Multi-leg templates belong to the
// later strategy-builder stages and should not be implied by this shape.
export const STRATEGY_TEMPLATES = {
  "long-call": { id: "long-call", label: "Long Call", side: "buy", type: "call" },
  "short-call": { id: "short-call", label: "Short Call", side: "sell", type: "call" },
  "long-put": { id: "long-put", label: "Long Put", side: "buy", type: "put" },
  "short-put": { id: "short-put", label: "Short Put", side: "sell", type: "put" }
} as const satisfies Record<string, StrategyTemplate>;

export type StrategyTemplateId = keyof typeof STRATEGY_TEMPLATES;

export const DEFAULT_STRATEGY_TEMPLATE_ID: StrategyTemplateId = "long-call";

export function getStrategyTemplate(id: StrategyTemplateId): StrategyTemplate {
  return STRATEGY_TEMPLATES[id];
}

export function templateForLeg(leg: Pick<Leg, "side" | "type">): StrategyTemplate {
  const duration = leg.side === "buy" ? "long" : "short";
  return getStrategyTemplate(`${duration}-${leg.type}` as StrategyTemplateId);
}
