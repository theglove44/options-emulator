import { describe, expect, it } from "vitest";
import { initialLeg } from "./mockData";
import {
  DEFAULT_STRATEGY_TEMPLATE_ID,
  resolveStrategyTemplateContracts,
  resolveStrategyTemplateContractsForChain,
  STRATEGY_TEMPLATES,
  getStrategyTemplate,
  templateForLeg
} from "./strategyTemplates";

describe("strategy template registry", () => {
  const expiry = {
    expiration_date: "2026-09-18",
    days_to_expiration: 34,
    expiration_type: "Regular",
    settlement_type: "PM",
    contracts: [12, 13, 14, 15, 16, 17].flatMap((strike) => (["call", "put"] as const).map((option_type) => ({
      symbol: `${strike}${option_type}`,
      streamer_symbol: null,
      expiration_date: "2026-09-18",
      days_to_expiration: 34,
      strike,
      option_type,
      shares_per_contract: 100,
      active: true
    })))
  };

  it("registers the complete supported builder catalogue", () => {
    expect(Object.keys(STRATEGY_TEMPLATES)).toEqual([
      "long-call",
      "short-call",
      "long-put",
      "short-put",
      "call-credit-spread",
      "put-credit-spread",
      "vertical-spread",
      "straddle",
      "strangle",
      "short-strangle",
      "calendar-spread",
      "diagonal-spread",
      "iron-condor"
    ]);
  });

  it("keeps Long Call as the default template", () => {
    expect(getStrategyTemplate(DEFAULT_STRATEGY_TEMPLATE_ID)).toEqual({
      id: "long-call",
      label: "Long Call",
      legs: [{ side: "buy", type: "call", strikeRole: "anchor" }]
    });
  });

  it("defines explicit canonical legs for the new strategy families", () => {
    expect(STRATEGY_TEMPLATES["vertical-spread"].legs).toEqual([
      { side: "buy", type: "call", strikeRole: "anchor" },
      { side: "sell", type: "call", strikeRole: "upper" }
    ]);
    expect(STRATEGY_TEMPLATES.straddle.legs).toHaveLength(2);
    expect(STRATEGY_TEMPLATES.strangle.legs).toEqual([
      { side: "buy", type: "put", strikeRole: "lower" },
      { side: "buy", type: "call", strikeRole: "upper" }
    ]);
    expect(STRATEGY_TEMPLATES["calendar-spread"].legs.map((leg) => leg.expiryRole)).toEqual(["near", "far"]);
    expect(STRATEGY_TEMPLATES["diagonal-spread"].legs).toHaveLength(2);
    expect(STRATEGY_TEMPLATES["iron-condor"].legs).toHaveLength(4);
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

  it("resolves canonical strikes without clamping invalid layouts", () => {
    const contracts = resolveStrategyTemplateContracts(expiry, STRATEGY_TEMPLATES["iron-condor"], 14.18);

    expect(contracts?.map((contract) => `${contract.strike}${contract.option_type}`)).toEqual([
      "12put",
      "13put",
      "15call",
      "16call"
    ]);
    expect(resolveStrategyTemplateContracts({ ...expiry, contracts: expiry.contracts.filter((contract) => contract.strike <= 14) }, STRATEGY_TEMPLATES["vertical-spread"], 14.18)).toBeNull();
  });

  it("resolves shared-role legs from common strikes", () => {
    const asymmetricExpiry = {
      ...expiry,
      contracts: expiry.contracts.filter((contract) => (
        contract.option_type === "call" && [13, 14, 16].includes(contract.strike)
      ) || (
        contract.option_type === "put" && [12, 15, 16].includes(contract.strike)
      ))
    };

    const contracts = resolveStrategyTemplateContracts(asymmetricExpiry, STRATEGY_TEMPLATES.straddle, 14.2);

    expect(contracts?.map((contract) => `${contract.strike}${contract.option_type}`)).toEqual([
      "16call",
      "16put"
    ]);
  });

  it("resolves calendar legs across the nearest two expirations", () => {
    const laterExpiry = {
      ...expiry,
      expiration_date: "2026-10-16",
      days_to_expiration: 62,
      contracts: expiry.contracts.map((contract) => ({ ...contract, expiration_date: "2026-10-16" }))
    };
    const contracts = resolveStrategyTemplateContractsForChain(
      [expiry, laterExpiry],
      STRATEGY_TEMPLATES["calendar-spread"],
      14.18,
      expiry.expiration_date
    );

    expect(contracts?.map((contract) => contract.expiration_date)).toEqual(["2026-09-18", "2026-10-16"]);
  });
});
