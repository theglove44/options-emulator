import { useEffect, useMemo, useRef, useState } from "react";
import { fetchChain, fetchHealth, fetchQuotes, fetchSymbolSearch } from "./api";
import type { ChainExpiration, OptionChainResponse, OptionContract, PricingMode, QuoteResponse, QuoteSnapshot, SymbolResult } from "./api";
import { initialLeg } from "./mockData";
import { buildPositionProfile, hasUnboundedProfit, summarizePosition } from "./position";
import { DEFAULT_STRATEGY_TEMPLATE_ID, getStrategyTemplate, resolveStrategyTemplateContractsForChain, STRATEGY_TEMPLATES, templateForLeg } from "./strategyTemplates";
import type { StrategyTemplate, StrategyTemplateId } from "./strategyTemplates";
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
  const [symbolInput, setSymbolInput] = useState("ETHA");
  const [symbolSuggestions, setSymbolSuggestions] = useState<SymbolResult[]>([]);
  const [spot, setSpot] = useState<number | null>(null);
  const [legs, setLegs] = useState<Leg[]>([initialLeg]);
  const [activeLegId, setActiveLegId] = useState(initialLeg.id);
  const [chain, setChain] = useState<OptionChainResponse | null>(null);
  const [underlyingResponse, setUnderlyingResponse] = useState<QuoteResponse | null>(null);
  const [underlyingQuote, setUnderlyingQuote] = useState<QuoteSnapshot | null>(null);
  const [optionResponse, setOptionResponse] = useState<QuoteResponse | null>(null);
  const [mode, setMode] = useState<"fixture" | "tastytrade">("fixture");
  const [pricingMode, setPricingMode] = useState<PricingMode>("midpoint");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [view, setView] = useState<"graph" | "table">("graph");
  const [range, setRange] = useState(14);
  const [selectedTemplateId, setSelectedTemplateId] = useState<StrategyTemplateId | "custom">(DEFAULT_STRATEGY_TEMPLATE_ID);
  const templateChainSymbol = useRef<string | null>(null);
  const activeLeg = legs.find((item) => item.id === activeLegId) ?? legs[0] ?? initialLeg;
  const currentTemplateId = legs.length === 1 ? templateForLeg(activeLeg).id : selectedTemplateId;
  const strategyTemplate = currentTemplateId === "custom" ? null : getStrategyTemplate(currentTemplateId);

  useEffect(() => {
    const query = symbolInput.trim();
    if (!query) {
      setSymbolSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchSymbolSearch(query)
        .then((response) => {
          if (!cancelled) setSymbolSuggestions(response.items);
        })
        .catch(() => {
          if (!cancelled) setSymbolSuggestions([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [symbolInput]);

  useEffect(() => {
    const requestedSymbol = symbol.trim().toUpperCase();
    if (!requestedSymbol) return;
    let cancelled = false;
    setTemplateError(null);
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextChain, quotes, health] = await Promise.all([
          fetchChain(requestedSymbol),
          fetchQuotes([requestedSymbol], pricingMode),
          fetchHealth()
        ]);
        if (cancelled) return;
        setChain(nextChain);
        setUnderlyingResponse(quotes);
        const underlying = findQuote(quotes, requestedSymbol);
        setUnderlyingQuote(underlying);
        setSpot(underlying?.selected_price ?? null);
        setMode(health.mode);
        setLegs((current) => current.map((item) => {
          const existingContract = findContract(nextChain, item);
          const contract = existingContract ?? chooseDefaultContract(nextChain, item.type);
          const preserveInvalidTemplateLeg = current.length > 1
            && selectedTemplateId !== "custom"
            && chain?.underlying_symbol === requestedSymbol
            && !existingContract;
          if (preserveInvalidTemplateLeg) return { ...item, price: 0, priceLoaded: false };
          return contract
            ? { ...item, expiry: contract.expiration_date, strike: contract.strike, type: contract.option_type, price: 0, priceLoaded: false, multiplier: contract.shares_per_contract }
            : { ...item, expiry: "", strike: 0, price: 0, priceLoaded: false };
        }));
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Market data could not be loaded");
          templateChainSymbol.current = null;
          setChain(null);
          setUnderlyingResponse(null);
          setUnderlyingQuote(null);
          setOptionResponse(null);
          setSpot(null);
          setLegs((current) => current.map((item) => ({ ...item, price: 0, priceLoaded: false })));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pricingMode, refreshToken, symbol]);

  useEffect(() => {
    if (!chain) return;
    const symbolChanged = templateChainSymbol.current !== chain.underlying_symbol;
    templateChainSymbol.current = chain.underlying_symbol;
    if (legs.length <= 1 || selectedTemplateId === "custom") return;
    if (!symbolChanged) {
      if (legs.some((item) => !findContract(chain, item))) setSelectedTemplateId("custom");
      return;
    }
    const template = getStrategyTemplate(selectedTemplateId);
    const nearExpiry = chain.expirations.find((item) => item.expiration_date === legs[0].expiry) ?? chain.expirations[0];
    if (!nearExpiry) return;
    const contracts = resolveStrategyTemplateContractsForChain(
      chain.expirations,
      template,
      spot != null && spot > 0 ? spot : legs[0].strike || 14,
      nearExpiry.expiration_date
    );
    if (!contracts) {
      setSelectedTemplateId("custom");
      return;
    }
    const nextLegs = buildTemplateLegs(template, contracts, nearExpiry);
    const unchanged = nextLegs.length === legs.length && nextLegs.every((nextLeg, index) => {
      const current = legs[index];
      return current.side === nextLeg.side && current.type === nextLeg.type && current.expiry === nextLeg.expiry && current.strike === nextLeg.strike;
    });
    if (!unchanged) {
      setLegs(nextLegs);
      setActiveLegId(nextLegs[0]?.id ?? initialLeg.id);
    }
  }, [chain, legs, selectedTemplateId, spot]);

  const selectedExpiry = chain?.expirations.find((item) => item.expiration_date === activeLeg.expiry);
  const strikeContracts = selectedExpiry?.contracts.filter((contract) => contract.option_type === activeLeg.type && contract.active) ?? [];
  const legContractKey = legs.map((item) => `${item.id}:${item.expiry}:${item.strike}:${item.type}`).join("|");
  const selectedContracts = useMemo(
    () => legs
      .map((item) => findContract(chain, item))
      .filter((contract): contract is OptionContract => Boolean(contract)),
    [chain, legContractKey]
  );
  const selectedContractKey = legs.map((item) => {
    const contract = findContract(chain, item);
    return `${item.id}:${item.side}:${contract?.symbol ?? `${item.expiry}:${item.strike}:${item.type}`}`;
  }).join("|");

  useEffect(() => {
    let cancelled = false;
    setOptionResponse(null);
    if (!selectedContracts.length) return;
    fetchQuotes(selectedContracts.map((contract) => contract.symbol), pricingMode)
      .then((quotes) => {
        if (cancelled) return;
        setOptionResponse(quotes);
        setLegs((current) => current.map((item) => {
          const contract = findContract(chain, item);
          const quote = contract ? findQuote(quotes, contract.symbol) : null;
          return quote?.selected_price != null ? { ...item, price: quote.selected_price, priceLoaded: true } : item;
        }));
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Option quote could not be loaded");
      });
    return () => {
      cancelled = true;
    };
  }, [chain, pricingMode, refreshToken, selectedContractKey]);

  const spotValue = spot ?? 0;
  const expiryKeys = new Set(legs.map((item) => item.expiry).filter(Boolean));
  const hasMixedExpiries = expiryKeys.size > 1;
  const allLegsPriced = legs.every((item) => item.priceLoaded);
  const profile = useMemo(
    () => (spotValue > 0 && legs.length > 0 && !hasMixedExpiries && legs.every((item) => item.strike > 0 && item.priceLoaded)
      ? buildPositionProfile(legs, spotValue, range / 100)
      : []),
    [hasMixedExpiries, legs, range, spotValue]
  );
  const maxPnl = profile.length ? Math.max(...profile.map((point) => point.pnl)) : 0;
  const minPnl = profile.length ? Math.min(...profile.map((point) => point.pnl)) : 0;
  const summary = useMemo(() => summarizePosition(legs), [legs]);
  const breakeven = legs.length === 1 && activeLeg.priceLoaded ? calculateBreakeven(activeLeg) : null;
  const strategyName = strategyTemplate?.label ?? "Custom position";
  const breakevenChange = breakeven != null && spotValue > 0 ? ((breakeven / spotValue - 1) * 100).toFixed(1) : "0.0";
  const context = optionResponse ?? underlyingResponse ?? chain;
  const freshness = context?.stale ? "stale" : context?.delayed ? "delayed" : "observed";
  const observedAt = context ? new Date(context.observed_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const observedPricingMode = context?.pricing_mode ?? pricingMode;
  const pricingModeLabel = formatPricingMode(pricingMode);
  const entryPrice = activeLeg.price;
  const cashFlowLabel = allLegsPriced
    ? (summary.netCashFlow > 0 ? "Net debit" : summary.netCashFlow < 0 ? "Net credit" : "Net cash flow")
    : "Net cash flow";

  function updateActiveLeg(update: Partial<Leg>) {
    const nextLeg = { ...activeLeg, ...update };
    setLegs((current) => current.map((item) => item.id === activeLeg.id ? nextLeg : item));
    setSelectedTemplateId(legs.length === 1 ? templateForLeg(nextLeg).id : "custom");
  }

  function choosePricingMode(nextPricingMode: PricingMode) {
    if (nextPricingMode === pricingMode) return;
    setPricingMode(nextPricingMode);
    setUnderlyingResponse(null);
    setUnderlyingQuote(null);
    setOptionResponse(null);
    setSpot(null);
    setLegs((current) => current.map((item) => ({ ...item, price: 0, priceLoaded: false })));
    setLoading(true);
  }

  function commitSymbol(nextValue = symbolInput) {
    const normalized = nextValue.trim().toUpperCase();
    if (!normalized) return;
    const suggestion = symbolSuggestions.find((item) => item.symbol.toUpperCase() === normalized);
    const nextSymbol = suggestion?.symbol.toUpperCase() ?? normalized;
    setSymbolInput(nextSymbol);
    setSymbolSuggestions([]);
    if (nextSymbol === symbol) {
      setRefreshToken((value) => value + 1);
      return;
    }
    setSymbol(nextSymbol);
  }

  function applyStrategyTemplate(templateId: StrategyTemplateId) {
    if (!chain) return;
    const template = getStrategyTemplate(templateId);
    const nearExpiry = chain.expirations.find((item) => item.expiration_date === legs[0]?.expiry) ?? chain.expirations[0];
    if (!nearExpiry) return;
    const anchorStrike = spotValue > 0 ? spotValue : activeLeg.strike > 0 ? activeLeg.strike : 14;
    const contracts = resolveStrategyTemplateContractsForChain(chain.expirations, template, anchorStrike, nearExpiry.expiration_date);
    if (!contracts) {
      setTemplateError(`${template.label} cannot be resolved from the available expirations and strikes.`);
      return;
    }
    setTemplateError(null);
    const nextLegs = buildTemplateLegs(template, contracts, nearExpiry);
    setLegs(nextLegs);
    setActiveLegId(nextLegs[0]?.id ?? initialLeg.id);
    setSelectedTemplateId(templateId);
  }

  function chooseExpiry(expiry: ChainExpiration) {
    const matching = expiry.contracts
      .filter((contract) => contract.option_type === activeLeg.type && contract.active)
      .sort((left, right) => Math.abs(left.strike - activeLeg.strike) - Math.abs(right.strike - activeLeg.strike))[0];
    const nextStrike = matching?.strike ?? activeLeg.strike;
    if (activeLeg.expiry === expiry.expiration_date && activeLeg.strike === nextStrike) return;
    updateActiveLeg({ expiry: expiry.expiration_date, strike: nextStrike, price: 0, priceLoaded: false, multiplier: matching?.shares_per_contract ?? activeLeg.multiplier });
  }

  function chooseStrike(contract: OptionContract) {
    if (activeLeg.strike === contract.strike) return;
    updateActiveLeg({ strike: contract.strike, price: 0, priceLoaded: false, multiplier: contract.shares_per_contract });
  }

  function switchType(positionLeg: Leg = activeLeg) {
    const nextType: Leg["type"] = positionLeg.type === "call" ? "put" : "call";
    const expiry = chain?.expirations.find((item) => item.expiration_date === positionLeg.expiry);
    const matching = expiry?.contracts
      .filter((contract) => contract.option_type === nextType && contract.active)
      .sort((left, right) => Math.abs(left.strike - positionLeg.strike) - Math.abs(right.strike - positionLeg.strike))[0];
    setActiveLegId(positionLeg.id);
    const nextLeg: Leg = { ...positionLeg, type: nextType, strike: matching?.strike ?? positionLeg.strike, price: 0, priceLoaded: false, multiplier: matching?.shares_per_contract ?? positionLeg.multiplier };
    setLegs((current) => current.map((item) => item.id === positionLeg.id ? nextLeg : item));
    setSelectedTemplateId(legs.length === 1 ? templateForLeg(nextLeg).id : "custom");
  }

  function addLeg() {
    const nextId = nextLegId(legs);
    setLegs([...legs, { ...activeLeg, id: nextId }]);
    setActiveLegId(nextId);
    setSelectedTemplateId("custom");
  }

  function removeLeg(legId: string = activeLeg.id) {
    if (legs.length <= 1) return;
    const activeIndex = legs.findIndex((item) => item.id === legId);
    const nextLegs = legs.filter((item) => item.id !== legId);
    setLegs(nextLegs);
    if (legId === activeLegId) {
      const nextActive = nextLegs[Math.min(activeIndex, nextLegs.length - 1)];
      setActiveLegId(nextActive.id);
    }
    setSelectedTemplateId(nextLegs.length === 1 ? templateForLeg(nextLegs[0]).id : "custom");
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
            <label className="template-field">
              <span>Template</span>
              <select value={currentTemplateId} onChange={(event) => applyStrategyTemplate(event.target.value as StrategyTemplateId)} disabled={!chain} aria-label="Strategy template">
                {currentTemplateId === "custom" && <option value="custom">Custom position</option>}
                {Object.values(STRATEGY_TEMPLATES).map((template) => {
                  const nearExpiry = chain?.expirations.find((item) => item.expiration_date === legs[0]?.expiry) ?? chain?.expirations[0];
                  const available = chain && nearExpiry
                    ? resolveStrategyTemplateContractsForChain(chain.expirations, template, spotValue > 0 ? spotValue : activeLeg.strike || 14, nearExpiry.expiration_date)
                    : null;
                  return <option key={template.id} value={template.id} disabled={!available}>{template.label}</option>;
                })}
              </select>
            </label>
            <button className="button primary" onClick={() => updateActiveLeg({ side: activeLeg.side === "buy" ? "sell" : "buy" })}>Flip side ↔</button>
            <button className="button" onClick={addLeg}>Positions ({summary.legCount}) +</button>
            <button className="button">Save trade ▣</button>
          </div>
        </div>

        <section className="quote-row">
          <label className="symbol-field">
            <span>Symbol</span>
            <input
              list="symbol-suggestions"
              value={symbolInput}
              onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
              onBlur={() => commitSymbol()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitSymbol();
                }
              }}
              aria-label="Underlying symbol"
              placeholder="AAPL"
            />
            <datalist id="symbol-suggestions">
              {symbolSuggestions.map((item) => <option key={item.symbol} value={item.symbol}>{item.description}</option>)}
            </datalist>
          </label>
          <div className="spot-price">
            {spot != null ? money.format(spot) : "—"}
            <span className="spot-detail">{underlyingQuote?.selected_price != null ? `${pricingModeLabel} ${price.format(underlyingQuote.selected_price)}` : "Loading quote"}</span>
          </div>
          <span className="data-badge">{mode} • {freshness}</span>
          <label className="pricing-field">
            <span>Pricing</span>
            <select value={pricingMode} onChange={(event) => choosePricingMode(event.target.value as PricingMode)} aria-label="Pricing mode">
              <option value="midpoint">Midpoint</option>
              <option value="bid">Bid</option>
              <option value="ask">Ask</option>
            </select>
          </label>
          <div className="quote-actions">
            <button className="button subtle" onClick={() => setRefreshToken((value) => value + 1)} disabled={loading}>Refresh quote ↻</button>
          </div>
        </section>

        {error && <div className="data-error" role="alert">Market data unavailable: {error}</div>}
        {templateError && <div className="data-error" role="alert">Strategy template unavailable: {templateError}</div>}

        <section className="expiry-section">
          <div className="section-label">Expiration <strong>{selectedExpiry?.days_to_expiration ?? "—"}d</strong><span className="expiry-legend">Weekly / Monthly</span></div>
          <div className="expiry-track">
            {(chain?.expirations ?? []).map((item) => (
              <button key={item.expiration_date} className={`expiry-pill ${item.expiration_date === activeLeg.expiry ? "selected" : ""}`} onClick={() => chooseExpiry(item)} aria-label={`${formatExpiry(item.expiration_date)} ${formatExpirationKind(item)} expiration, ${item.days_to_expiration} days`}>
                <span>{formatExpiry(item.expiration_date)}</span><small><strong className="expiry-kind">{formatExpirationKind(item)}</strong><span>{item.days_to_expiration}d</span></small>
              </button>
            ))}
          </div>
        </section>

        <section className="strike-section">
          <div className="strike-heading"><div className="section-label">Strike <strong>{activeLeg.strike || "—"}{activeLeg.type === "call" ? "C" : "P"}</strong></div><span>Select a {activeLeg.type === "call" ? "call" : "put"} strike for this leg</span></div>
          <div className="strike-grid" role="group" aria-label={`${activeLeg.type === "call" ? "Call" : "Put"} strikes`}>
            {strikeContracts.map((contract) => (
              <button
                type="button"
                key={contract.symbol}
                className={`strike-option ${activeLeg.strike === contract.strike ? "selected" : ""}`}
                onClick={() => chooseStrike(contract)}
                aria-label={`${formatStrike(contract.strike)} ${activeLeg.type === "call" ? "call" : "put"} strike`}
                aria-pressed={activeLeg.strike === contract.strike}
              >
                <strong>{formatStrike(contract.strike)}</strong>
                <small>{activeLeg.type === "call" ? "CALL" : "PUT"}</small>
              </button>
            ))}
            {!strikeContracts.length && <span className="strike-empty">No active strikes available for this leg.</span>}
          </div>
          <div className="strike-context"><span>{strikeContracts.length ? `${strikeContracts.length} available strikes` : "—"}</span><span className="spot-marker">{symbol} {spot != null ? spot.toFixed(2) : "—"}</span></div>
        </section>

        <section className="position-summary" aria-label="Position summary details">
          <div><span className="section-label">Position summary</span><strong>{summary.legCount} leg{summary.legCount === 1 ? "" : "s"}</strong></div>
          <div><span className="section-label">{cashFlowLabel}</span><strong>{allLegsPriced ? money.format(Math.abs(summary.netCashFlow)) : "—"}</strong></div>
          <span className="modelled-note">Modelled from recorded entry prices</span>
        </section>

        <section className="metrics-grid" aria-label="Position summary">
          <Metric label={cashFlowLabel} value={allLegsPriced ? money.format(Math.abs(summary.netCashFlow)) : "—"} tone="neutral" />
          <Metric label="Max loss" value={profile.length ? money.format(Math.abs(minPnl)) : "—"} tone="loss" />
          <Metric label="Max profit" value={profile.length ? (hasUnboundedProfit(legs) ? "Infinite" : money.format(Math.max(maxPnl, 0))) : "—"} tone="profit" />
          <Metric label="Breakeven" value={breakeven != null && activeLeg.strike ? `${activeLeg.type === "call" ? "Above" : "Below"} ${breakeven.toFixed(2)}` : "Multi-leg"} detail={breakeven != null && activeLeg.strike ? `${Number(breakevenChange) >= 0 ? "+" : ""}${breakevenChange}%` : "See aggregate graph"} tone="neutral" />
        </section>

        <section className="chart-panel">
          <div className="chart-header">
            <div><span className="section-label">Projected outcome</span><strong>At expiration</strong></div>
            <div className="chart-controls">
              <span>View ±{range}%</span>
              <button className="zoom-button" onClick={() => setRange((value) => Math.min(60, value + 5))} aria-label="Zoom out">−</button>
              <input type="range" min="8" max="60" value={range} onChange={(event) => setRange(Number(event.target.value))} aria-label="Price range" />
              <button className="zoom-button" onClick={() => setRange((value) => Math.max(8, value - 5))} aria-label="Zoom in">+</button>
            </div>
          </div>
          {profile.length ? (view === "graph" ? <PayoffGraph profile={profile} spot={spotValue} breakeven={breakeven ?? undefined} /> : <PayoffTable profile={profile} />) : <div className="empty-state">{!allLegsPriced ? "Loading observed quote data for the local expiration model…" : hasMixedExpiries ? "Align leg expiries before modelling the aggregate expiration outcome…" : "Select a valid contract for every leg to model the aggregate expiration outcome…"}</div>}
          <div className="display-bar">
            <div className="segmented"><button className={view === "table" ? "selected" : ""} onClick={() => setView("table")}>▦ Table</button><button className={view === "graph" ? "selected" : ""} onClick={() => setView("graph")}>⌁ Graph</button></div>
            <div className="segmented units"><button className="selected">Profit / Loss $</button><button>Profit / Loss %</button><button>Contract value</button></div>
          </div>
        </section>

        <section className="leg-list" aria-label="Position legs">
          {legs.map((positionLeg) => {
            const positionEntryPrice = positionLeg.id === activeLeg.id ? entryPrice : positionLeg.price;
            return (
              <div className={`leg-card ${positionLeg.id === activeLeg.id ? "active" : ""}`} key={positionLeg.id}>
                <button className="leg-select" onClick={() => setActiveLegId(positionLeg.id)} aria-pressed={positionLeg.id === activeLeg.id}>
                  <div className={`leg-side ${positionLeg.side}`}>{positionLeg.side === "buy" ? "BTO" : "STO"}</div>
                  <div className="leg-main"><strong>{symbol} {positionLeg.strike || "—"}{positionLeg.type === "call" ? "C" : "P"}</strong><span>{positionLeg.expiry || "—"} · {positionLeg.quantity} contract{positionLeg.quantity === 1 ? "" : "s"}</span></div>
                  <div className="leg-price"><span>Entry price · {pricingModeLabel.toLowerCase()}</span><strong>{positionLeg.priceLoaded ? price.format(positionEntryPrice) : "—"}</strong></div>
                </button>
                <div className="leg-actions">
                  <button className="button subtle" onClick={() => switchType(positionLeg)} disabled={!chain}>Switch to {positionLeg.type === "call" ? "put" : "call"}</button>
                  {legs.length > 1 && <button className="button subtle remove-leg" onClick={() => removeLeg(positionLeg.id)}>Remove</button>}
                </div>
              </div>
            );
          })}
          <button className="button subtle add-leg" onClick={addLeg}>+ Add leg</button>
        </section>
        <div className="data-context">Observed market data: {context?.source ?? mode}, {freshness}, observed {observedAt}, pricing mode {formatPricingMode(observedPricingMode)}. Modelled scenario: aggregate expiration intrinsic value using each recorded entry price when all leg expiries are aligned; no pre-expiry valuation.</div>
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

function buildTemplateLegs(template: StrategyTemplate, contracts: OptionContract[], expiry: ChainExpiration): Leg[] {
  return template.legs.map((spec, index) => {
    const contract = contracts[index];
    return {
      ...initialLeg,
      id: `leg-${index + 1}`,
      side: spec.side,
      type: spec.type,
      expiry: contract?.expiration_date ?? expiry.expiration_date,
      strike: contract?.strike ?? 0,
      price: 0,
      priceLoaded: false,
      multiplier: contract?.shares_per_contract ?? 100
    };
  });
}

function nextLegId(legs: readonly Leg[]): string {
  let index = legs.length + 1;
  while (legs.some((leg) => leg.id === `leg-${index}`)) index += 1;
  return `leg-${index}`;
}

function calculateBreakeven(leg: Leg): number {
  if (leg.type === "call") return leg.side === "buy" ? leg.strike + leg.price : leg.strike - leg.price;
  return leg.side === "buy" ? leg.strike - leg.price : leg.strike + leg.price;
}

function formatExpiry(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).format(new Date(`${value}T00:00:00Z`));
}

function formatStrike(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(/0$/, "");
}

function formatExpirationKind(expiry: Pick<ChainExpiration, "expiration_date" | "expiration_type">): string {
  const type = expiry.expiration_type.toLowerCase();
  if (type.includes("weekly")) return "Weekly";
  if (type.includes("monthly")) return "Monthly";
  const date = new Date(`${expiry.expiration_date}T00:00:00Z`);
  const isThirdFriday = date.getUTCDay() === 5 && date.getUTCDate() >= 15 && date.getUTCDate() <= 21;
  return isThirdFriday ? "Monthly" : "Weekly";
}

function formatPricingMode(value: PricingMode): string {
  return value === "midpoint" ? "Midpoint" : value === "bid" ? "Bid" : value === "ask" ? "Ask" : "Last";
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone: "neutral" | "loss" | "profit" }) {
  return <div className="metric"><span>{label}</span><strong className={tone}>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

type GraphPoint = { price: number; pnl: number };
type SignedGraphSegment = { positive: boolean; points: GraphPoint[] };

function appendGraphPoint(points: GraphPoint[], point: GraphPoint): GraphPoint[] {
  const previous = points.at(-1);
  return previous && Math.abs(previous.price - point.price) < 0.000001 ? points : [...points, point];
}

function buildSignedGraphSegments(profile: GraphPoint[]): SignedGraphSegment[] {
  if (profile.length === 0) return [];
  const segments: SignedGraphSegment[] = [];
  let positive = profile[0].pnl >= 0;
  let points: GraphPoint[] = [profile[0]];

  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1];
    const current = profile[index];
    const crossesZero = (previous.pnl < 0 && current.pnl >= 0) || (previous.pnl >= 0 && current.pnl < 0);

    if (crossesZero) {
      const ratio = -previous.pnl / (current.pnl - previous.pnl);
      const crossing = {
        price: previous.price + (current.price - previous.price) * ratio,
        pnl: 0
      };
      points = appendGraphPoint(points, crossing);
      segments.push({ positive, points });
      positive = current.pnl >= 0;
      points = [crossing];
    }

    points = appendGraphPoint(points, current);
  }

  segments.push({ positive, points });
  return segments;
}

function graphPath(points: GraphPoint[], x: (underlyingPrice: number) => number, y: (pnl: number) => number): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.price).toFixed(1)},${y(point.pnl).toFixed(1)}`).join(" ");
}

function graphAreaPath(points: GraphPoint[], x: (underlyingPrice: number) => number, y: (pnl: number) => number): string {
  const path = graphPath(points, x, y);
  const first = points[0];
  const last = points.at(-1)!;
  return `${path} L ${x(last.price).toFixed(1)},${y(0).toFixed(1)} L ${x(first.price).toFixed(1)},${y(0).toFixed(1)} Z`;
}

function interpolateGraphPnl(profile: GraphPoint[], underlyingPrice: number): number {
  const first = profile[0];
  const last = profile.at(-1)!;
  if (underlyingPrice <= first.price) return first.pnl;
  if (underlyingPrice >= last.price) return last.pnl;

  for (let index = 1; index < profile.length; index += 1) {
    const current = profile[index];
    if (underlyingPrice > current.price) continue;
    const previous = profile[index - 1];
    const ratio = (underlyingPrice - previous.price) / (current.price - previous.price);
    return previous.pnl + (current.pnl - previous.pnl) * ratio;
  }
  return last.pnl;
}

function findGraphBreakevens(profile: GraphPoint[], fallback?: number): number[] {
  const values: number[] = [];
  const add = (value: number) => {
    if (value < profile[0].price || value > profile.at(-1)!.price) return;
    if (!values.some((existing) => Math.abs(existing - value) < 0.000001)) values.push(value);
  };

  profile.forEach((point) => {
    if (point.pnl === 0) add(point.price);
  });
  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1];
    const current = profile[index];
    if (previous.pnl * current.pnl < 0) {
      add(previous.price + (current.price - previous.price) * (-previous.pnl / (current.pnl - previous.pnl)));
    }
  }
  if (fallback != null) add(fallback);
  return values.sort((left, right) => left - right);
}

function formatGraphPnl(value: number): string {
  const formatted = price.format(value);
  return value >= 0 ? `+${formatted}` : formatted;
}

function PayoffGraph({ profile, spot, breakeven }: { profile: GraphPoint[]; spot: number; breakeven?: number }) {
  const width = 1000;
  const height = 320;
  const min = Math.min(...profile.map((point) => point.pnl), 0);
  const max = Math.max(...profile.map((point) => point.pnl), 0);
  const first = profile[0];
  const last = profile.at(-1)!;
  const x = (underlyingPrice: number) => ((underlyingPrice - first.price) / (last.price - first.price)) * width;
  const y = (pnl: number) => height - ((pnl - min) / (max - min || 1)) * height;
  const segments = buildSignedGraphSegments(profile);
  const breakevenPrices = findGraphBreakevens(profile, breakeven);
  const [hovered, setHovered] = useState<{ price: number; pnl: number; x: number } | null>(null);

  function handleMouseMove(event: React.MouseEvent<SVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = Math.max(0, Math.min(width, ((event.clientX - bounds.left) / bounds.width) * width));
    const hoveredPrice = first.price + ((last.price - first.price) * pointerX) / width;
    setHovered({ price: hoveredPrice, pnl: interpolateGraphPnl(profile, hoveredPrice), x: pointerX });
  }

  const tooltipWidth = 178;
  const tooltipHeight = 56;
  const tooltipX = hovered == null ? 0 : Math.max(8, Math.min(width - tooltipWidth - 8, hovered.x + 12));
  const tooltipY = hovered == null ? 0 : Math.max(8, Math.min(height - tooltipHeight - 8, y(hovered.pnl) - tooltipHeight - 10));

  return <div className="graph-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Projected profit and loss at expiration"><g className="grid-lines"><line x1="0" y1={y(0)} x2={width} y2={y(0)} /><line x1="0" y1="80" x2={width} y2="80" /><line x1="0" y1="160" x2={width} y2="160" /><line x1="0" y1="240" x2={width} y2="240" /></g>{segments.map((segment, index) => <path key={`area-${index}`} className={segment.positive ? "profit-fill" : "loss-fill"} d={graphAreaPath(segment.points, x, y)} />)}{segments.map((segment, index) => <path key={`line-${index}`} className={`payoff-line ${segment.positive ? "profit-line" : "loss-line"}`} d={graphPath(segment.points, x, y)} />)}<line className="reference-line" x1={x(spot)} y1="0" x2={x(spot)} y2={height} />{breakevenPrices.map((value, index) => <g key={`breakeven-${value}`}><line className="breakeven-line" x1={x(value)} y1="0" x2={x(value)} y2={height} /><text x={Math.min(width - 76, x(value) + 8)} y={index % 2 === 0 ? "38" : "58"}>B/E {value.toFixed(2)}</text></g>)}<text x={Math.min(width - 88, x(spot) + 8)} y="18">Spot {spot.toFixed(2)}</text><rect className="graph-hit-area" x="0" y="0" width={width} height={height} onMouseMove={handleMouseMove} onMouseLeave={() => setHovered(null)} />{hovered != null && <><line className="hover-line" x1={hovered.x} y1="0" x2={hovered.x} y2={height} /><circle className={`hover-dot ${hovered.pnl >= 0 ? "profit" : "loss"}`} cx={hovered.x} cy={y(hovered.pnl)} r="5" /><g className="graph-tooltip" transform={`translate(${tooltipX},${tooltipY})`}><rect width={tooltipWidth} height={tooltipHeight} rx="6" /><text x="10" y="21">Underlying {price.format(hovered.price)}</text><text x="10" y="42">P&amp;L {formatGraphPnl(hovered.pnl)}</text></g></>}</svg><div className="axis-labels"><span>${first.price.toFixed(2)}</span><span>${spot.toFixed(2)}</span><span>${last.price.toFixed(2)}</span></div></div>;
}

function PayoffTable({ profile }: { profile: { price: number; pnl: number }[] }) {
  const sample = profile.filter((_, index) => index % 2 === 0);
  return <div className="payoff-table"><div className="table-head"><span>Underlying</span><span>Now</span><span>+7 days</span><span>+14 days</span><span>At expiry</span></div>{sample.map((point) => <div className="table-row" key={point.price}><span>${point.price.toFixed(2)}</span><span className={point.pnl >= 0 ? "profit-text" : "loss-text"}>{money.format(point.pnl)}</span><span className={point.pnl >= 0 ? "profit-text" : "loss-text"}>{money.format(point.pnl * .84)}</span><span className={point.pnl >= 0 ? "profit-text" : "loss-text"}>{money.format(point.pnl * .92)}</span><span className={point.pnl >= 0 ? "profit-text" : "loss-text"}>{money.format(point.pnl)}</span></div>)}</div>;
}

export default App;
