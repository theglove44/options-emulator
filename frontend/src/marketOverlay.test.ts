import { describe, expect, it } from "vitest";
import { getFixtureMarketOverlay } from "./marketOverlay";

describe("fixture market overlays", () => {
  it("returns deterministic, explicitly synthetic ETHA event and liquidity data", () => {
    const overlay = getFixtureMarketOverlay("etha");

    expect(overlay).toEqual({
      symbol: "ETHA",
      source: "fixture_overlay",
      events: [
        expect.objectContaining({ id: "etha-macro-window", date: "2026-08-21", kind: "macro", impact: "high" }),
        expect.objectContaining({ id: "etha-expiry-window", date: "2026-08-28", kind: "expiry" })
      ],
      liquidity: {
        tier: "standard",
        spreadPercent: 0.7,
        volume: 1250,
        openInterest: 4820,
        description: "Synthetic contract-level band for fixture visualisation."
      }
    });
  });

  it("does not share mutable event or liquidity objects between calls", () => {
    const first = getFixtureMarketOverlay("SPY");
    first.events[0].title = "Changed locally";
    first.liquidity.spreadPercent = 99;

    const second = getFixtureMarketOverlay("SPY");
    expect(second.events[0].title).toBe("Macro event window");
    expect(second.liquidity.spreadPercent).toBe(0.1);
  });

  it("keeps unknown symbols usable with a clearly fixture-only fallback", () => {
    const overlay = getFixtureMarketOverlay("newco");

    expect(overlay.symbol).toBe("NEWCO");
    expect(overlay.source).toBe("fixture_overlay");
    expect(overlay.events[0].description).toContain("unknown-symbol fixture");
    expect(overlay.liquidity.tier).toBe("standard");
  });
});
