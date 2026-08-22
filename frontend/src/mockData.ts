import type { Leg } from "./types";
import { DEFAULT_STRATEGY_TEMPLATE_ID, getStrategyTemplate } from "./strategyTemplates";

const defaultTemplate = getStrategyTemplate(DEFAULT_STRATEGY_TEMPLATE_ID);

export const initialLeg: Leg = {
  id: "leg-1",
  side: defaultTemplate.legs[0].side,
  type: defaultTemplate.legs[0].type,
  strike: 0,
  expiry: "",
  quantity: 1,
  price: 0,
  priceLoaded: false,
  multiplier: 100
};
