import { describe, expect, it } from "vitest";
import { initialLeg } from "./mockData";
import {
  DEFAULT_STRATEGY_TEMPLATE_ID,
  STRATEGY_TEMPLATES,
  getStrategyTemplate,
  templateForLeg
} from "./strategyTemplates";

describe("strategy template registry", () => {
  it("registers the existing single-leg builder forms", () => {
    expect(Object.keys(STRATEGY_TEMPLATES)).toEqual([
      "long-call",
      "short-call",
      "long-put",
      "short-put"
    ]);
  });

  it("keeps Long Call as the default template", () => {
    expect(getStrategyTemplate(DEFAULT_STRATEGY_TEMPLATE_ID)).toEqual({
      id: "long-call",
      label: "Long Call",
      side: "buy",
      type: "call"
    });
  });

  it("maps the existing side/type controls to explicit templates", () => {
    expect(templateForLeg({ side: "sell", type: "put" }).id).toBe("short-put");
    expect(templateForLeg({ side: "buy", type: "call" }).label).toBe("Long Call");
  });

  it("keeps the current Long Call initial leg driven by the registry", () => {
    expect(initialLeg.side).toBe("buy");
    expect(initialLeg.type).toBe("call");
    expect(templateForLeg(initialLeg).id).toBe(DEFAULT_STRATEGY_TEMPLATE_ID);
  });
});
