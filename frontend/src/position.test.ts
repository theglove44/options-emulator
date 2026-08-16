import { describe, expect, it } from "vitest";
import { buildPositionProfile, hasUnboundedProfit, summarizePosition } from "./position";
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
  it("identifies unlimited upside from net long call exposure", () => {
    expect(hasUnboundedProfit([longCall])).toBe(true);
    expect(hasUnboundedProfit([
      longCall,
      { ...longCall, id: "leg-2", side: "sell", strike: 15, price: 0.4 }
    ])).toBe(false);
    expect(hasUnboundedProfit([
      { ...longCall, type: "put", strike: 13, price: 0.4 },
      { ...longCall, id: "leg-2", strike: 15, price: 0.5 }
    ])).toBe(true);
  });

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

  it("models a canonical vertical call spread", () => {
    const profile = buildPositionProfile([
      longCall,
      { ...longCall, id: "leg-2", side: "sell", strike: 15, price: 0.4 }
    ], 16);

    expect(summarizePosition([
      longCall,
      { ...longCall, id: "leg-2", side: "sell", strike: 15, price: 0.4 }
    ]).netDebit).toBeCloseTo(50);
    expect(profile.find((point) => point.price === 16)?.pnl).toBeCloseTo(50);
  });

  it("models a long straddle at one strike", () => {
    const legs: Leg[] = [
      longCall,
      { ...longCall, id: "leg-2", type: "put", price: 0.8 }
    ];
    const profileAt14 = buildPositionProfile(legs, 14);
    const profileAt16 = buildPositionProfile(legs, 16);

    expect(profileAt14.find((point) => point.price === 14)?.pnl).toBeCloseTo(-170);
    expect(profileAt16.find((point) => point.price === 16)?.pnl).toBeCloseTo(30);
  });

  it("includes strike breakpoints when finding extrema", () => {
    const legs: Leg[] = [
      { ...longCall, price: 1.08 },
      { ...longCall, id: "leg-2", type: "put", price: 0.8 }
    ];

    const profile = buildPositionProfile(legs, 14.18);

    expect(Math.min(...profile.map((point) => point.pnl))).toBeCloseTo(-188);
  });

  it("models a long strangle with separated strikes", () => {
    const legs: Leg[] = [
      { ...longCall, type: "put", strike: 13, price: 0.4 },
      { ...longCall, id: "leg-2", strike: 15, price: 0.5 }
    ];
    const profileAt14 = buildPositionProfile(legs, 14);
    const profileAt12 = buildPositionProfile(legs, 12);

    expect(profileAt14.find((point) => point.price === 14)?.pnl).toBeCloseTo(-90);
    expect(profileAt12.find((point) => point.price === 12)?.pnl).toBeCloseTo(10);
  });

  it("models a four-leg iron condor", () => {
    const legs = [
      { ...longCall, type: "put" as const, strike: 12, price: 0.1 },
      { ...longCall, id: "leg-2", side: "sell" as const, type: "put" as const, strike: 13, price: 0.4 },
      { ...longCall, id: "leg-3", side: "sell" as const, strike: 15, price: 0.4 },
      { ...longCall, id: "leg-4", strike: 16, price: 0.1 }
    ];

    expect(summarizePosition(legs).netCredit).toBeCloseTo(60);
    expect(buildPositionProfile(legs, 14).find((point) => point.price === 14)?.pnl).toBeCloseTo(60);
  });
});
