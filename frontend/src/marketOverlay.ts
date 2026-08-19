export type FixtureEventKind = "macro" | "company" | "expiry";
export type FixtureImpact = "low" | "medium" | "high";
export type FixtureLiquidityTier = "thin" | "standard" | "deep";

export type FixtureMarketEvent = {
  id: string;
  date: string;
  title: string;
  kind: FixtureEventKind;
  impact: FixtureImpact;
  description: string;
};

export type FixtureLiquidityOverlay = {
  tier: FixtureLiquidityTier;
  spreadPercent: number;
  volume: number;
  openInterest: number;
  description: string;
};

export type FixtureMarketOverlay = {
  symbol: string;
  source: "fixture_overlay";
  events: FixtureMarketEvent[];
  liquidity: FixtureLiquidityOverlay;
};

const FIXTURE_OVERLAYS: Record<string, Omit<FixtureMarketOverlay, "symbol">> = {
  ETHA: createOverlay("standard", 0.7, [
    event("etha-macro-window", "2026-08-21", "Macro event window", "macro", "high", "Synthetic calendar marker for testing event-aware layouts."),
    event("etha-expiry-window", "2026-08-28", "Weekly expiry window", "expiry", "medium", "Synthetic expiry marker; it does not predict price or volatility.")
  ]),
  AAPL: createOverlay("deep", 0.2, [
    event("aapl-company-window", "2026-08-28", "Company event window", "company", "high", "Synthetic event marker; no external calendar has been queried.")
  ]),
  SPY: createOverlay("deep", 0.1, [
    event("spy-macro-window", "2026-08-21", "Macro event window", "macro", "medium", "Synthetic calendar marker for testing event-aware layouts.")
  ]),
  IWM: createOverlay("standard", 0.4, [
    event("iwm-expiry-window", "2026-09-18", "Monthly expiry window", "expiry", "medium", "Synthetic expiry marker; it does not predict price or volatility.")
  ])
};

const DEFAULT_OVERLAY: Omit<FixtureMarketOverlay, "symbol"> = {
  source: "fixture_overlay",
  events: [event("default-market-window", "2026-08-21", "Market event window", "macro", "low", "Synthetic marker for unknown-symbol fixture coverage.")],
  liquidity: {
    tier: "standard",
    spreadPercent: 0.8,
    volume: 1000,
    openInterest: 4000,
    description: "Synthetic contract-level band for fixture visualisation."
  }
};

export function getFixtureMarketOverlay(symbol: string): FixtureMarketOverlay {
  const normalized = symbol.trim().toUpperCase();
  const overlay = FIXTURE_OVERLAYS[normalized] ?? DEFAULT_OVERLAY;
  return {
    symbol: normalized,
    source: overlay.source,
    events: overlay.events.map((item) => ({ ...item })),
    liquidity: { ...overlay.liquidity }
  };
}

function createOverlay(
  tier: FixtureLiquidityTier,
  spreadPercent: number,
  events: FixtureMarketEvent[]
): Omit<FixtureMarketOverlay, "symbol"> {
  return {
    source: "fixture_overlay",
    events,
    liquidity: {
      tier,
      spreadPercent,
      volume: 1250,
      openInterest: 4820,
      description: "Synthetic contract-level band for fixture visualisation."
    }
  };
}

function event(
  id: string,
  date: string,
  title: string,
  kind: FixtureEventKind,
  impact: FixtureImpact,
  description: string
): FixtureMarketEvent {
  return { id, date, title, kind, impact, description };
}
