import { useMemo, useState } from "react";
import { buildProfile, expiries, initialLeg } from "./mockData";
import type { Leg } from "./types";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function App() {
  const [symbol, setSymbol] = useState("ETHA");
  const [spot, setSpot] = useState(14.18);
  const [leg, setLeg] = useState<Leg>(initialLeg);
  const [view, setView] = useState<"graph" | "table">("graph");
  const [range, setRange] = useState(14);

  const profile = useMemo(() => buildProfile(leg, spot), [leg, spot]);
  const maxPnl = Math.max(...profile.map((point) => point.pnl));
  const minPnl = Math.min(...profile.map((point) => point.pnl));
  const breakeven = leg.type === "call"
    ? (leg.side === "buy" ? leg.strike + leg.price : leg.strike - leg.price)
    : (leg.side === "buy" ? leg.strike - leg.price : leg.strike + leg.price);
  const expiry = expiries.find((item) => item.value === leg.expiry) ?? expiries[2];
  const strategyName = `${leg.side === "buy" ? "Long" : "Short"} ${leg.type === "call" ? "Call" : "Put"}`;
  const breakevenChange = ((breakeven / spot - 1) * 100).toFixed(1);

  function updateLeg(update: Partial<Leg>) {
    setLeg((current) => ({ ...current, ...update }));
  }

  function flipSide() {
    updateLeg({ side: leg.side === "buy" ? "sell" : "buy" } as Partial<Leg>);
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
        <div className="connection-status"><i /> Fixture data</div>
      </header>

      <section className="workspace">
        <div className="builder-toolbar">
          <div className="strategy-heading">
            <div className="eyebrow">Strategy builder <span className="help">?</span></div>
            <h1>{strategyName}</h1>
          </div>
          <div className="toolbar-actions">
            <button className="button primary" onClick={flipSide}>Flip side ↔</button>
            <button className="button">Positions (1) ☷</button>
            <button className="button">Save trade ▣</button>
          </div>
        </div>

        <section className="quote-row">
          <label className="symbol-field">
            <span>Symbol</span>
            <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} />
          </label>
          <div className="spot-price">{money.format(spot)} <span className="down">−0.35% / −$0.05</span></div>
          <span className="data-badge">Fixture • read-only</span>
          <div className="quote-actions">
            <button className="button subtle" onClick={() => setSpot((value) => Number((value + 0.1).toFixed(2)))}>Refresh quote ↻</button>
          </div>
        </section>

        <section className="expiry-section">
          <div className="section-label">Expiration <strong>{expiry.dte}d</strong></div>
          <div className="expiry-track">
            {expiries.map((item) => (
              <button
                key={item.value}
                className={`expiry-pill ${item.value === leg.expiry ? "selected" : ""}`}
                onClick={() => updateLeg({ expiry: item.value })}
              >
                <span>{item.label}</span><small>{item.dte}d</small>
              </button>
            ))}
          </div>
        </section>

        <section className="strike-section">
          <div className="section-label">Strike <strong>{leg.strike}{leg.type === "call" ? "C" : "P"}</strong></div>
          <input
            className="strike-slider"
            type="range"
            min="8"
            max="22"
            step="0.5"
            value={leg.strike}
            onChange={(event) => updateLeg({ strike: Number(event.target.value) })}
            aria-label="Strike"
          />
          <div className="strike-scale"><span>8</span><span>10</span><span>12</span><span className="spot-marker">{symbol} {spot.toFixed(2)}</span><span>16</span><span>18</span><span>22</span></div>
        </section>

        <section className="metrics-grid" aria-label="Position summary">
          <Metric label={leg.side === "buy" ? "Net debit" : "Net credit"} value={money.format(leg.price * leg.quantity * 100)} tone="neutral" />
          <Metric label="Max loss" value={money.format(Math.abs(minPnl))} tone="loss" />
          <Metric label="Max profit" value={maxPnl >= 100000 ? "Infinite" : money.format(maxPnl)} tone="profit" />
          <Metric label="Breakeven" value={`${leg.type === "call" ? "Above" : "Below"} ${breakeven.toFixed(2)}`} detail={`${Number(breakevenChange) >= 0 ? "+" : ""}${breakevenChange}%`} tone="neutral" />
        </section>

        <section className="chart-panel">
          <div className="chart-header">
            <div><span className="section-label">Projected outcome</span><strong>At expiration</strong></div>
            <div className="chart-controls">
              <span>Range ±{range}%</span>
              <input type="range" min="8" max="30" value={range} onChange={(event) => setRange(Number(event.target.value))} aria-label="Price range" />
            </div>
          </div>
          {view === "graph" ? <PayoffGraph profile={profile} spot={spot} breakeven={breakeven} /> : <PayoffTable profile={profile} />}
          <div className="display-bar">
            <div className="segmented"><button className={view === "table" ? "selected" : ""} onClick={() => setView("table")}>▦ Table</button><button className={view === "graph" ? "selected" : ""} onClick={() => setView("graph")}>⌁ Graph</button></div>
            <div className="segmented units"><button className="selected">Profit / Loss $</button><button>Profit / Loss %</button><button>Contract value</button></div>
          </div>
        </section>

        <section className="leg-card">
          <div className={`leg-side ${leg.side}`}>{leg.side === "buy" ? "BTO" : "STO"}</div>
          <div className="leg-main"><strong>{symbol} {leg.strike}{leg.type === "call" ? "C" : "P"}</strong><span>{leg.expiry} · {leg.quantity} contract{leg.quantity === 1 ? "" : "s"}</span></div>
          <div className="leg-price"><span>Entry price</span><strong>${leg.price.toFixed(2)}</strong></div>
          <button className="button subtle" onClick={() => updateLeg({ type: leg.type === "call" ? "put" : "call" })}>Switch to {leg.type === "call" ? "put" : "call"}</button>
        </section>
      </section>
      <footer className="footer-note">Educational estimates only · Source: fixture data · Model: expiration intrinsic value · No trading actions are available</footer>
    </main>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone: "neutral" | "loss" | "profit" }) {
  return <div className="metric"><span>{label}</span><strong className={tone}>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function PayoffGraph({ profile, spot, breakeven }: { profile: { price: number; pnl: number }[]; spot: number; breakeven: number }) {
  const width = 1000;
  const height = 320;
  const min = Math.min(...profile.map((point) => point.pnl), 0);
  const max = Math.max(...profile.map((point) => point.pnl), 0);
  const x = (price: number) => ((price - profile[0].price) / (profile.at(-1)!.price - profile[0].price)) * width;
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
