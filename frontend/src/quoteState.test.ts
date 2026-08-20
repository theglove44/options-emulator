import { describe, expect, it } from "vitest";
import { initialLeg } from "./mockData";
import { applyObservedPrices } from "./quoteState";

const legs = [
  { ...initialLeg, id: "leg-1", strike: 14 },
  { ...initialLeg, id: "leg-2", strike: 15, side: "sell" as const }
];
const symbols: Record<string, string> = { "leg-1": "14C", "leg-2": "15C" };

describe("quote price state transitions", () => {
  it("updates every leg from midpoint to bid to ask", () => {
    const midpoint = applyObservedPrices(legs, { "14C": 1.2, "15C": 0.75 }, (leg) => symbols[leg.id]);
    const bid = applyObservedPrices(midpoint, { "14C": 1.12, "15C": 0.69 }, (leg) => symbols[leg.id]);
    const ask = applyObservedPrices(bid, { "14C": 1.28, "15C": 0.81 }, (leg) => symbols[leg.id]);

    expect(midpoint.map((leg) => leg.price)).toEqual([1.2, 0.75]);
    expect(bid.map((leg) => leg.price)).toEqual([1.12, 0.69]);
    expect(ask.map((leg) => leg.price)).toEqual([1.28, 0.81]);
  });

  it("refreshes provenance while preserving a custom entry price", () => {
    const customised = [{ ...legs[0], customPrice: 1.05, price: 1.05 }];
    const refreshed = applyObservedPrices(customised, { "14C": 1.3 }, (leg) => symbols[leg.id]);

    expect(refreshed[0].price).toBe(1.05);
    expect(refreshed[0].customPrice).toBe(1.05);
    expect(refreshed[0].observedPrice).toBe(1.3);
  });

  it("does not apply a stale quote to a leg whose contract is unresolved", () => {
    const refreshed = applyObservedPrices(legs, { "14C": 9.99 }, () => null);
    expect(refreshed).toEqual(legs);
  });
});
