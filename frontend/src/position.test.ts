import { describe, expect, it } from "vitest";
import { buildPositionProfile, buildPreExpiryProfile, calculatePreExpiryPnl, hasUnboundedProfit, summarizeModelledGreeks, summarizeObservedGreeks, summarizePosition } from "./position";
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

const longCallGreeks = {
  side: "buy" as const,
  quantity: 1,
  multiplier: 100,
  selectedPrice: 1.08,
  greeks: { delta: 0.56, gamma: 0.12, theta: -0.04, vega: 0.08, rho: 0.02 }
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
      netCredit: 0,
      entryCommission: 0
    });
  });

  it("applies per-contract commissions to entry cash flow and expiration P&L", () => {
    const summary = summarizePosition([longCall], 0.65);
    const profile = buildPositionProfile([longCall], 14, 0.14, 0.65);

    expect(summary.netDebit).toBeCloseTo(90.65);
    expect(summary.entryCommission).toBeCloseTo(0.65);
    expect(profile.find((point) => point.price === 14)?.pnl).toBeCloseTo(-91.3);
  });

  it("keeps custom entry prices in the same multiplier and cash-flow convention", () => {
    const customPriceLeg = { ...longCall, price: 1.2, customPrice: 1.2, observedPrice: 0.9 };

    expect(summarizePosition([customPriceLeg]).netDebit).toBeCloseTo(120);
    expect(buildPositionProfile([customPriceLeg], 14).find((point) => point.price === 14)?.pnl).toBeCloseTo(-120);
  });

  it("summarises complete observed Greeks with side, quantity, and multiplier", () => {
    const summary = summarizeObservedGreeks([
      longCallGreeks,
      {
        ...longCallGreeks,
        side: "sell",
        quantity: 2,
        multiplier: 10,
        selectedPrice: 0.4,
        greeks: { delta: -0.44, gamma: 0.12, theta: -0.04, vega: 0.08, rho: -0.02 }
      }
    ]);

    expect(summary.complete).toBe(true);
    expect(summary.delta).toBeCloseTo(64.8);
    expect(summary.gamma).toBeCloseTo(9.6);
    expect(summary.theta).toBeCloseTo(-3.2);
    expect(summary.vega).toBeCloseTo(6.4);
    expect(summary.rho).toBeCloseTo(2.4);
  });

  it("accepts a zero observed price as loaded data", () => {
    expect(summarizeObservedGreeks([{ ...longCallGreeks, selectedPrice: 0 }]).complete).toBe(true);
  });

  it("withholds the aggregate when a leg price or Greek is missing", () => {
    expect(summarizeObservedGreeks([{ ...longCallGreeks, selectedPrice: null }])).toEqual({
      complete: false,
      delta: null,
      gamma: null,
      theta: null,
      vega: null,
      rho: null
    });
    expect(summarizeObservedGreeks([{
      ...longCallGreeks,
      greeks: { ...longCallGreeks.greeks, vega: null }
    }]).complete).toBe(false);
  });

  it("sums each leg into the modelled expiration profile", () => {
    const profile = buildPositionProfile([
      longCall,
      { ...longCall, id: "leg-2", side: "sell", price: 0.35 }
    ], 14);

    const atSpot = profile.find((point) => point.price === 14);
    expect(atSpot?.pnl).toBeCloseTo(-55);
  });

  it("uses the requested range when sampling the payoff graph", () => {
    const narrow = buildPositionProfile([longCall], 14, 0.08);
    const wide = buildPositionProfile([longCall], 14, 0.3);

    expect(narrow[0].price).toBeCloseTo(12.88);
    expect(narrow.at(-1)?.price).toBeCloseTo(15.12);
    expect(wide[0].price).toBeCloseTo(9.8);
    expect(wide.at(-1)?.price).toBeCloseTo(18.2);
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

  it("models pre-expiry value from per-leg IV and scenario date", () => {
    const pnl = calculatePreExpiryPnl([{ leg: longCall, volatility: 0.45 }], 14, "2026-08-18");
    expect(pnl).toBeGreaterThan(-90);
    expect(pnl).toBeLessThan(100);
    expect(buildPreExpiryProfile([{ leg: longCall, volatility: 0.45 }], 14, "2026-08-18")).toHaveLength(33);
  });

  it("withholds pre-expiry output when a leg IV is missing", () => {
    expect(calculatePreExpiryPnl([{ leg: longCall, volatility: null }], 14, "2026-08-18")).toBeNull();
    expect(buildPreExpiryProfile([{ leg: longCall, volatility: null }], 14, "2026-08-18")).toEqual([]);
  });

  it("aggregates modelled future Greeks with side, quantity, and multiplier", () => {
    const oneContract = summarizeModelledGreeks([
      { leg: { ...longCall, multiplier: 1 }, volatility: 0.45 }
    ], 14, "2026-08-18");
    const shortWeighted = summarizeModelledGreeks([
      { leg: { ...longCall, side: "sell", quantity: 2, multiplier: 10 }, volatility: 0.45 }
    ], 14, "2026-08-18");

    expect(oneContract.complete).toBe(true);
    expect(shortWeighted.complete).toBe(true);
    expect(shortWeighted.delta).toBeCloseTo(-(oneContract.delta ?? 0) * 20);
    expect(shortWeighted.gamma).toBeCloseTo(-(oneContract.gamma ?? 0) * 20);
    expect(shortWeighted.theta).toBeCloseTo(-(oneContract.theta ?? 0) * 20);
    expect(shortWeighted.vega).toBeCloseTo(-(oneContract.vega ?? 0) * 20);
    expect(shortWeighted.rho).toBeCloseTo(-(oneContract.rho ?? 0) * 20);
  });

  it("withholds modelled future Greeks when scenario IV or date is missing", () => {
    expect(summarizeModelledGreeks([{ leg: longCall, volatility: null }], 14, "2026-08-18").complete).toBe(false);
    expect(summarizeModelledGreeks([{ leg: longCall, volatility: 0.45 }], 14, "").complete).toBe(false);
  });

  it("subtracts entry and exit commissions from pre-expiry modelled P&L", () => {
    const withoutCommission = calculatePreExpiryPnl([{ leg: longCall, volatility: 0.45 }], 14, "2026-08-18");
    const withCommission = calculatePreExpiryPnl([{ leg: longCall, volatility: 0.45 }], 14, "2026-08-18", 0.65);

    expect(withoutCommission).not.toBeNull();
    expect(withCommission).toBeCloseTo((withoutCommission ?? 0) - 1.3);
  });
});
