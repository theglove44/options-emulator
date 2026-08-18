import { describe, expect, it } from "vitest";
import { calculateOptionPrice, clampScenarioDate, formatVolatilityPercent, parseVolatilityPercent, yearFraction } from "./scenario";

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
});
