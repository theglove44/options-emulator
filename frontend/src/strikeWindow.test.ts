import { describe, expect, it } from "vitest";
import type { OptionContract, QuoteResponse } from "./api";
import { filterStrikeContractsToDeltaWindow, selectPreviewStrikeContracts } from "./strikeWindow";

function contract(strike: number, symbol = `${strike}`): OptionContract {
  return {
    symbol,
    streamer_symbol: null,
    expiration_date: "2026-11-20",
    days_to_expiration: 59,
    strike,
    option_type: "call",
    shares_per_contract: 100,
    active: true
  };
}

function quotes(items: Array<{ symbol: string; delta: number }>): QuoteResponse {
  return {
    source: "fixture",
    observed_at: "2026-09-22T12:00:00Z",
    delayed: false,
    stale: false,
    pricing_mode: "midpoint",
    notes: [],
    spot_price: 100,
    items: items.map(({ symbol, delta }) => ({
      symbol,
      streamer_symbol: null,
      instrument_type: "equity_option",
      underlying_symbol: "TEST",
      expiration_date: "2026-11-20",
      strike: Number(symbol),
      option_type: "call",
      bid: 1,
      ask: 1.1,
      midpoint: 1.05,
      last: 1.05,
      mark: null,
      selected_price: 1.05,
      volume: 1,
      open_interest: 1,
      greeks: { implied_volatility: 0.2, delta, gamma: 0.1, theta: -0.1, rho: 0.1, vega: 0.1 },
      observed_at: "2026-09-22T12:00:00Z",
      delayed: false,
      stale: false
    }))
  };
}

describe("strike visibility window", () => {
  it("keeps the nearest contracts for the loading preview", () => {
    const contracts = Array.from({ length: 60 }, (_, index) => contract(index + 1));
    const preview = selectPreviewStrikeContracts(contracts, 30);

    expect(preview).toHaveLength(50);
    expect(preview[0].strike).toBe(5);
    expect(preview.at(-1)?.strike).toBe(54);
  });

  it("shows the 10-delta to 90-delta band and retains the selected contract", () => {
    const contracts = [contract(80), contract(90), contract(100), contract(110), contract(120)];
    const response = quotes([
      { symbol: "80", delta: 0.95 },
      { symbol: "90", delta: 0.9 },
      { symbol: "100", delta: 0.5 },
      { symbol: "110", delta: 0.1 },
      { symbol: "120", delta: 0.05 }
    ]);

    const visible = filterStrikeContractsToDeltaWindow(contracts, response, new Set(["80"]));

    expect(visible.map((item) => item.strike)).toEqual([80, 90, 100, 110]);
  });
});
