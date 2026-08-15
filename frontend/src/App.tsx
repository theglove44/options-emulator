import { useEffect, useMemo, useState } from "react";
import { fetchChain, fetchHealth, fetchQuotes } from "./api";
import type { ChainExpiration, OptionChainResponse, OptionContract, QuoteResponse, QuoteSnapshot } from "./api";
import { buildProfile, initialLeg } from "./mockData";
import { templateForLeg } from "./strategyTemplates";
import type { Leg } from "./types";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const price = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function App() {
  const [symbol, setSymbol] = useState("ETHA");
  const [spot, setSpot] = useState<number | null>(null);
  const [leg, setLeg] = useState<Leg>(initialLeg);
  const [chain, setChain] = useState<OptionChainResponse | null>(null);
  const [underlyingResponse, setUnderlyingResponse] = useState<QuoteResponse | null>(null);
  const [underlyingQuote, setUnderlyingQuote] = useState<QuoteSnapshot | null>(null);
  const [optionResponse, setOptionResponse] = useState<QuoteResponse | null>(null);
  const [optionQuote, setOptionQuote] = useState<QuoteSnapshot | null>(null);
  const [mode, setMode] = useState<"fixture" | "tastytrade">("fixture");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [view, setView] = useState<"graph" | "table">("graph");
  const [range, setRange] = useState(14);
  const strategyTemplate = templateForLeg(leg);

  useEffect(() => {
    const requestedSymbol = symbol.trim().toUpperCase();
    if (!requestedSymbol) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextChain, quotes, health] = await Promise.all([
          fetchChain(requestedSymbol),
          fetchQuotes([requestedSymbol], "midpoint"),
          fetchHealth()
        ]);
        if (cancelled) return;
        setChain(nextChain);
        setUnderlyingResponse(quotes);
        const underlying = findQuote(quotes, requestedSymbol);
        setUnderlyingQuote(underlying);
        setSpot(underlying?.selected_price ?? null);
        setMode(health.mode);
        const defaultContract = chooseDefaultContract(nextChain, initialLeg.type);
        if (defaultContract) {
          setLeg((current) => ({
            ...current,
            expiry: defaultContract.expiration_date,
            strike: defaultContract.strike,
            type: defaultContract.option_type
          }));
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Market data could not be loaded");
          setChain(null);
          setUnderlyingResponse(null);
          setUnderlyingQuote(null);
          setOptionResponse(null);
          setOptionQuote(null);
          setSpot(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [symbol, refreshToken]);

  const selectedContract = useMemo(() => findContract(chain, leg), [chain, leg.expiry, leg.strike, leg.type]);
  const selectedExpiry = chain?.expirations.find((item) => item.expiration_date === leg.expiry);
  const strikeContracts = selectedExpiry?.contracts.filter((contract) => contract.option_type === leg.type && contract.active) ?? [];

  useEffect(() => {
    if (!selectedContract) return;
    let cancelled = false;
    setOptionResponse(null);
    setOptionQuote(null);
    fetchQuotes([selectedContract.symbol], "midpoint")
      .then((quotes) => {
        if (cancelled) return;
        setOptionResponse(quotes);
        const quote = findQuote(quotes, selectedContract.symbol);
        setOptionQuote(quote);
        if (quote?.selected_price != null) {
          setLeg((current) => ({ ...current, price: quote.selected_price ?? current.price }));
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Option quote could not be loaded");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedContract?.symbol, refreshToken]);

  const spotValue = spot ?? 0;
  const profile = useMemo(
    () => (spotValue > 0 && leg.strike > 0 ? buildProfile(leg, spotValue) : []),
    [leg, spotValue]
  );
  const maxPnl = profile.length ? Math.max(...profile.map((point) => point.pnl)) : 0;
  const minPnl = profile.length ? Math.min(...profile.map((point) => point.pnl)) : 0;
  const breakeven = leg.type === "call"
    ? (leg.side === "buy" ? leg.strike + leg.price : leg.strike - leg.price)
    : (leg.side === "buy" ? leg.strike - leg.price : leg.strike + leg.price);
  const strategyName = strategyTemplate.label;
  const breakevenChange = spotValue > 0 ? ((breakeven / spotValue - 1) * 100).toFixed(1) : "0.0";
  const context = optionResponse ?? underlyingResponse ?? chain;
  const freshness = context?.stale ? "stale" : context?.delayed ? "delayed" : "observed";
  const observedAt = context ? new Date(context.observed_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const pricingMode = context?.pricing_mode ?? "midpoint";
  const entryPrice = optionQuote?.selected_price ?? leg.price;

  function updateLeg(update: Partial<Leg>) {
    setLeg((current) => ({ ...current, ...update }));
  }

  function chooseExpiry(expiry: ChainExpiration) {
    const matching = expiry.contracts
      .filter((contract) => contract.option_type === leg.type && contract.active)
      .sort((left, right) => Math.abs(left.strike - leg.strike) - Math.abs(right.strike - leg.strike))[0];
    updateLeg({ expiry: expiry.expiration_date, strike: matching?.strike ?? leg.strike });
  }

  function chooseStrike(value: number) {
    const nearest = strikeContracts
      .slice()
      .sort((left, right) => Math.abs(left.strike - value) - Math.abs(right.strike - value))[0];
    updateLeg({ strike: nearest?.strike ?? value });
  }

  function switchType() {
    const nextType = leg.type === "call" ? "put" : "call";
    const matching = selectedExpiry?.contracts
      .filter((contract) => contract.option_type === nextType && contract.active)
      .sort((left, right) => Math.abs(left.strike - leg.strike) - Math.abs(right.strike - leg.strike))[0];
    updateLeg({ type: nextType, strike: matching?.strike ?? leg.strike });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><span>◆</span> Option<span>Emulator</span></div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className="nav-item active">Build</button>
          <button className="nav-item">Saved trades</button>
          <button className="nav-item">Optimizer</button>
          <button className="nav-item">Settings</button>
        </nav>
        <div className="connection-status"><i /> {mode === "fixture" ? "Fixture data" : "Tastytrade data"}</div>
      </header>

      <section className="workspace">
        <div className="builder-toolbar">
          <div className="strategy-heading">
            <div className="eyebrow">Strategy builder <span className="help">?</span></div>
            <h1>{strategyName}</h1>
          </div>
          <div className="toolbar-actions">
            <button className="button primary" onClick={() => updateLeg({ side: leg.side === "buy" ? "sell" : "buy" })}>Flip side ↔</button>
            <button className="button">Positions (1) ☷</button>
            <button className="button">Save trade ▣</button>
          </div>
        </div>

        <section className="quote-row">
          <label className="symbol-field">
            <span>Symbol</span>
            <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} />
          </label>
          <div className="spot-price">
            {spot != null ? money.format(spot) : "—"}
            <span className="spot-detail">{underlyingQuote?.midpoint != null ? `Midpoint ${price.format(underlyingQuote.midpoint)}` : "Loading quote"}</span>
          </div>
          <span className="data-badge">{mode} • {freshness}</span>
          <div className="quote-actions">
            <button className="button subtle" onClick={() => setRefreshToken((value) => value + 1)} disabled={loading}>Refresh quote ↻</button>
          </div>
        </section>

        {error && <div className="data-error" role="alert">Market data unavailable: {error}</div>}

        <section className="expiry-section">
          <div className="section-label">Expiration <strong>{selectedExpiry?.days_to_expiration ?? "—"}d</strong></div>
          <div className="expiry-track">
            {(chain?.expirations ?? []).map((item) => (
              <button key={item.expiration_date} className={`expiry-pill ${item.expiration_date === leg.expiry ? "selected" : ""}`} onClick={() => chooseExpiry(item)}>
                <span>{formatExpiry(item.expiration_date)}</span><small>{item.days_to_expiration}d</small>
              </button>
            ))}
          </div>
        </section>

        <section className="strike-section">
          <div className="section-label">Strike <strong>{leg.strike || "—"}{leg.type === "call" ? "C" : "P"}</strong></div>
          <input className="strike-slider" type="range" min={strikeContracts[0]?.strike ?? 0} max={strikeContracts.at(-1)?.strike ?? 1} step="0.5" value={leg.strike || 0} onChange={(event) => chooseStrike(Number(event.target.value))} aria-label="Strike" disabled={!strikeContracts.length} />
          <div className="strike-scale"><span>{strikeContracts[0]?.strike ?? "—"}</span><span className="spot-marker">{symbol} {spot != null ? spot.toFixed(2) : "—"}</span><span>{strikeContracts.at(-1)?.strike ?? "—"}</span></div>
        </section>

        <section className="metrics-grid" aria-label="Position summary">
          <Metric label={leg.side === "buy" ? "Net debit" : "Net credit"} value={entryPrice ? money.format(entryPrice * leg.quantity * 100) : "—"} tone="neutral" />
          <Metric label="Max loss" value={profile.length ? money.format(Math.abs(minPnl)) : "—"} tone="loss" />
          <Metric label="Max profit" value={profile.length ? (maxPnl >= 100000 ? "Infinite" : money.format(maxPnl)) : "—"} tone="profit" />
          <Metric label="Breakeven" value={leg.strike ? `${leg.type === "call" ? "Above" : "Below"} ${breakeven.toFixed(2)}` : "—"} detail={leg.strike ? `${Number(breakevenChange) >= 0 ? "+" : ""}${breakevenChange}%` : undefined} tone="neutral" />
        </section>

        <section className="chart-panel">
          <div className="chart-header">
            <div><span className="section-label">Projected outcome</span><strong>At expiration</strong></div>
            <div className="chart-controls">
              <span>Range ±{range}%</span>
              <input type="range" min="8" max="30" value={range} onChange={(event) => setRange(Number(event.target.value))} aria-label="Price range" />
            </div>
          </div>
          {profile.length ? (view === "graph" ? <PayoffGraph profile={profile} spot={spotValue} breakeven={breakeven} /> : <PayoffTable profile={profile} />) : <div className="empty-state">Loading observed quote data for the local expiration model…</div>}
          <div className="display-bar">
            <div className="segmented"><button className={view === "table" ? "selected" : ""} onClick={() => setView("table")}>▦ Table</button><button className={view === "graph" ? "selected" : ""} onClick={() => setView("graph")}>⌁ Graph</button></div>
            <div className="segmented units"><button className="selected">Profit / Loss $</button><button>Profit / Loss %</button><button>Contract value</button></div>
          </div>
        </section>

        <section className="leg-card">
          <div className={`leg-side ${leg.side}`}>{leg.side === "buy" ? "BTO" : "STO"}</div>
          <div className="leg-main"><strong>{symbol} {leg.strike || "—"}{leg.type === "call" ? "C" : "P"}</strong><span>{leg.expiry || "—"} · {leg.quantity} contract{leg.quantity === 1 ? "" : "s"}</span></div>
          <div className="leg-price"><span>Entry price · midpoint</span><strong>{entryPrice ? price.format(entryPrice) : "—"}</strong></div>
          <button className="button subtle" onClick={switchType} disabled={!selectedExpiry}>Switch to {leg.type === "call" ? "put" : "call"}</button>
        </section>
        <div className="data-context">Observed market data: {context?.source ?? mode}, {freshness}, observed {observedAt}, pricing mode {pricingMode}. Modelled scenario: expiration intrinsic value using the selected entry price; no pre-expiry valuation.</div>
      </section>
      <footer className="footer-note">Educational estimates only · Observed data and modelled scenario output are shown separately · No trading actions are available</footer>
    </main>
  );
}

function chooseDefaultContract(chain: OptionChainResponse, optionType: "call" | "put"): OptionContract | undefined {
  const contracts = chain.expirations.flatMap((expiration) => expiration.contracts).filter((contract) => contract.active);
  return contracts.find((contract) => contract.option_type === optionType && contract.expiration_date === "2026-09-18" && contract.strike === 14) ?? contracts.find((contract) => contract.option_type === optionType) ?? contracts[0];
}

function findContract(chain: OptionChainResponse | null, leg: Leg): OptionContract | undefined {
  return chain?.expirations.flatMap((expiration) => expiration.contracts).find((contract) => contract.active && contract.expiration_date === leg.expiry && contract.strike === leg.strike && contract.option_type === leg.type);
}

function findQuote(response: QuoteResponse, symbol: string): QuoteSnapshot | null {
  return response.items.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
}

function formatExpiry(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).format(new Date(`${value}T00:00:00Z`));
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone: "neutral" | "loss" | "profit" }) {
  return <div className="metric"><span>{label}</span><strong className={tone}>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function PayoffGraph({ profile, spot, breakeven }: { profile: { price: number; pnl: number }[]; spot: number; breakeven: number }) {
  const width = 1000;
  const height = 320;
  const min = Math.min(...profile.map((point) => point.pnl), 0);
  const max = Math.max(...profile.map((point) => point.pnl), 0);
  const x = (underlyingPrice: number) => ((underlyingPrice - profile[0].price) / (profile.at(-1)!.price - profile[0].price)) * width;
  const y = (pnl: number) => height - ((pnl - min) / (max - min || 1)) * height;
  const line = profile.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.price).toFixed(1)},${y(point.pnl).toFixed(1)}`).join(" ");
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  return <div className="graph-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Projected profit and loss at expiration"><defs><linearGradient id="profitFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#42d77d" stopOpacity=".55" /><stop offset="100%" stopColor="#42d77d" stopOpacity="0" /></linearGradient></defs><g className="grid-lines"><line x1="0" y1={y(0)} x2={width} y2={y(0)} /><line x1="0" y1="80" x2={width} y2="80" /><line x1="0" y1="160" x2={width} y2="160" /><line x1="0" y1="240" x2={width} y2="240" /></g><path d={area} fill="url(#profitFill)" /><path className="loss-fill" d={`${line} L ${x(profile.at(-1)!.price)},${y(0)} L ${x(profile[0].price)},${y(0)} Z`} /><path className="payoff-line" d={line} /><line className="reference-line" x1={x(spot)} y1="0" x2={x(spot)} y2={height} /><line className="breakeven-line" x1={x(breakeven)} y1="0" x2={x(breakeven)} y2={height} /><text x={x(spot) + 8} y="18">Spot {spot.toFixed(2)}</text><text x={x(breakeven) + 8} y="38">B/E {breakeven.toFixed(2)}</text></svg><div className="axis-labels"><span>${profile[0].price.toFixed(2)}</span><span>${spot.toFixed(2)}</span><span>${profile.at(-1)!.price.toFixed(2)}</span></div></div>;
}

function PayoffTable({ profile }: { profile: { price: number; pnl: number }[] }) {
  const sample = profile.filter((_, index) => index % 2 === 0);
  return <div className="payoff-table"><div className="table-head"><span>Underlying</span><span>Now</span><span>+7 days</span><span>+14 days</span><span>At expiry</span></div>{sample.map((point) => <div className="table-row" key={point.price}><span>${point.price.toFixed(2)}</span><span className={point.pnl >= 0 ? "profit-text" : "loss-text"}>{money.format(point.pnl)}</span><span className={point.pnl >= 0 ? "profit-text" : "loss-text"}>{money.format(point.pnl * .84)}</span><span className={point.pnl >= 0 ? "profit-text" : "loss-text"}>{money.format(point.pnl * .92)}</span><span className={point.pnl >= 0 ? "profit-text" : "loss-text"}>{money.format(point.pnl)}</span></div>)}</div>;
}

export default App;
