import type { Leg, ProfilePoint } from "./types";
import { buildPositionProfile } from "./position";
import { DEFAULT_STRATEGY_TEMPLATE_ID, getStrategyTemplate } from "./strategyTemplates";

const defaultTemplate = getStrategyTemplate(DEFAULT_STRATEGY_TEMPLATE_ID);

export const initialLeg: Leg = {
  id: "leg-1",
  side: defaultTemplate.side,
  type: defaultTemplate.type,
  strike: 0,
  expiry: "",
  quantity: 1,
  price: 0,
  priceLoaded: false,
  multiplier: 100
};

export function buildProfile(leg: Leg, spot: number): ProfilePoint[] {
  return buildPositionProfile([leg], spot);
}
