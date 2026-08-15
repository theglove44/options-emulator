import type { Leg, ProfilePoint } from "./types";
import { DEFAULT_STRATEGY_TEMPLATE_ID, getStrategyTemplate } from "./strategyTemplates";

const defaultTemplate = getStrategyTemplate(DEFAULT_STRATEGY_TEMPLATE_ID);

export const initialLeg: Leg = {
  id: "leg-1",
  side: defaultTemplate.side,
  type: defaultTemplate.type,
  strike: 0,
  expiry: "",
  quantity: 1,
  price: 0
};

export function buildProfile(leg: Leg, spot: number): ProfilePoint[] {
  const low = spot * 0.86;
  const high = spot * 1.14;
  return Array.from({ length: 33 }, (_, index) => {
    const price = low + ((high - low) * index) / 32;
    const intrinsic = leg.type === "call"
      ? Math.max(price - leg.strike, 0)
      : Math.max(leg.strike - price, 0);
    const pnl = (intrinsic - leg.price) * leg.quantity * 100 * (leg.side === "buy" ? 1 : -1);
    return { price, pnl };
  });
}
