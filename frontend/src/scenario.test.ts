import { describe, expect, it } from "vitest";
import { calculateOptionGreeks, calculateOptionPrice, clampScenarioDate, formatVolatilityPercent, parseVolatilityPercent, yearFraction } from "./scenario";

describe("scenario controls", () => {
  it("converts a positive percentage input into decimal volatility", () => {
    expect(parseVolatilityPercent("45")).toBeCloseTo(0.45);
    expect(parseVolatilityPercent(" 62.5 ")).toBeCloseTo(0.625);
  });

  it("rejects blank, non-numeric, and non-positive volatility inputs", () => {
    expect(parseVolatilityPercent("")).toBeNull();
    expect(parseVolatilityPercent("not-a-number")).toBeNull();
    expect(parseVolatilityPercent("0")).toBeNull();
    expect(parseVolatilityPercent("-10")).toBeNull();
  });

  it("formats observed and scenario volatility distinctly from raw decimals", () => {
    expect(formatVolatilityPercent(0.45)).toBe("45.0%");
    expect(formatVolatilityPercent(null)).toBe("—");
  });

  it("keeps a scenario date inside the available observation-to-expiry window", () => {
    expect(clampScenarioDate("2026-08-10", "2026-08-16", "2026-09-18")).toBe("2026-08-16");
    expect(clampScenarioDate("2026-09-30", "2026-08-16", "2026-09-18")).toBe("2026-09-18");
    expect(clampScenarioDate("2026-09-01", "2026-08-16", "2026-09-18")).toBe("2026-09-01");
  });

  it("calculates time to expiry without adding future-date Greeks", () => {
    expect(yearFraction("2026-08-18", "2026-09-18")).toBeCloseTo(31 / 365);
    expect(calculateOptionPrice({ type: "call", strike: 100, expiry: "2026-09-18" }, 100, 0.2, "2026-09-18")).toBe(0);
    expect(calculateOptionPrice({ type: "call", strike: 100, expiry: "2026-09-18" }, 100, 0.2, "2026-08-18")).toBeGreaterThan(0);
  });

  it("keeps call and put model values separate", () => {
    const call = calculateOptionPrice({ type: "call", strike: 100, expiry: "2026-09-18" }, 110, 0.2, "2026-08-18");
    const put = calculateOptionPrice({ type: "put", strike: 100, expiry: "2026-09-18" }, 110, 0.2, "2026-08-18");
    expect(call).toBeGreaterThan(put ?? 0);
  });

  it("calculates deterministic future Greeks with explicit display units", () => {
    const greeks = calculateOptionGreeks(
      { type: "call", strike: 100, expiry: "2027-01-01" },
      100,
      0.2,
      "2026-01-01"
    );

    expect(greeks?.delta).toBeCloseTo(0.6368, 3);
    expect(greeks?.gamma).toBeCloseTo(0.0188, 3);
    expect(greeks?.theta).toBeCloseTo(-0.0176, 3);
    expect(greeks?.vega).toBeCloseTo(0.3752, 3);
    expect(greeks?.rho).toBeCloseTo(0.5323, 3);
  });

  it("returns no future Greeks when the option has expired", () => {
    expect(calculateOptionGreeks(
      { type: "call", strike: 100, expiry: "2026-01-01" },
      100,
      0.2,
      "2026-01-02"
    )).toBeNull();
  });
});
