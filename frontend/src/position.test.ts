import { describe, expect, it } from "vitest";
import { buildPositionProfile, summarizePosition } from "./position";
import type { Leg } from "./types";

const longCall: Leg = {
  id: "leg-1",
  side: "buy",
  type: "call",
  strike: 14,
  expiry: "2026-09-18",
  quantity: 1,
  price: 0.9,
  priceLoaded: true,
  multiplier: 100
};

describe("position editing seam", () => {
  it("summarises debits and credits across explicit legs", () => {
    const summary = summarizePosition([
      longCall,
      { ...longCall, id: "leg-2", side: "sell", price: 0.35 }
    ]);

    expect(summary).toEqual({
      legCount: 2,
      netCashFlow: 55,
      netDebit: 55,
      netCredit: 0
    });
  });

  it("sums each leg into the modelled expiration profile", () => {
    const profile = buildPositionProfile([
      longCall,
      { ...longCall, id: "leg-2", side: "sell", price: 0.35 }
    ], 14);

    const atSpot = profile.find((point) => point.price === 14);
    expect(atSpot?.pnl).toBeCloseTo(-55);
  });

  it("preserves an adjusted contract multiplier in position arithmetic", () => {
    const adjustedLeg = { ...longCall, multiplier: 10 };

    expect(summarizePosition([adjustedLeg]).netDebit).toBeCloseTo(9);
    expect(buildPositionProfile([adjustedLeg], 14).find((point) => point.price === 14)?.pnl).toBeCloseTo(-9);
  });
});
