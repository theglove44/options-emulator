# Architecture

This document describes the architecture that exists in the current checkout.
It distinguishes the active browser calculation path from the separate backend
domain/payoff path so future work does not assume they are already one engine.

## Runtime shape

```text
start_app.sh
    |
    +--> Uvicorn / FastAPI on localhost
    |       |
    |       +--> FixtureMarketDataAdapter
    |       |       deterministic chain, quotes, and Greeks
    |       |
    |       +--> TastytradeMarketDataAdapter (explicit live mode only)
    |       |       backend credentials, chain, quotes, and DXLink Greeks
    |       |
    |       +--> backend domain + /api/payoff standalone calculation path
    |
    +--> Vite / React on localhost
            |
            +--> App.tsx state and UI
            |       |
            |       +--> api.ts --> FastAPI health/search/chain/quotes routes
            |       +--> position.ts + scenario.ts --> modelled display values
            |       +--> strategyTemplates.ts --> loaded-chain contract choices
            |       +--> savedStrategies.ts --> browser localStorage
            |       +--> marketOverlay.ts --> fixture-only synthetic context
            |
            +--> Vite /api proxy --> backend port
```

`start_app.sh` chooses ports with `scripts/choose_port.py`, starts the backend
with `MARKET_DATA_MODE=fixture`, starts Vite with the selected backend port, and
checks `/api/health` plus the frontend root before reporting readiness. There is
no worker, job queue, database, container configuration, CI workflow, or
deployment target in this repository.

## Backend components

### `backend/src/options_emulator/api.py`

`create_app()` builds the FastAPI application and stores one selected
`MarketDataAdapter` in application state. Routes use that adapter through a
small request dependency and translate missing live configuration into HTTP
503 responses.

The current routes are:

- `GET /api/health` — reports selected mode and `broker_access: read_only`.
- `GET /api/symbols/search?query=...` — normalised symbol search.
- `GET /api/chains/{symbol}` — full option chain and expirations.
- `GET /api/expirations/{symbol}` — expiration metadata without contracts.
- `GET /api/quotes?symbols=...&pricing_mode=...` — underlying/option quotes,
  selected price, spot price, timestamps, freshness, and available Greeks.
- `GET /api/greeks?symbols=...` — Greeks response for adapter/API verification.
- `POST /api/payoff` — a standalone one-leg expiration payoff calculation using
  the backend domain model. The current React UI does not call this route.

### `backend/src/options_emulator/market_data.py`

This module owns the normalised data contract and both implementations of the
`MarketDataAdapter` protocol. The contract keeps source, observation time,
delayed/stale state, pricing mode, notes, contract identity, bid/ask/midpoint,
last price, selected price, volume, open interest, and available Greeks together.

`FixtureMarketDataAdapter` generates deterministic symbol-specific chains,
quotes, and Greek snapshots. It is the safe default and does not contact a
broker.

`TastytradeMarketDataAdapter` imports the tastytrade SDK lazily. When explicitly
selected, it uses the SDK session, symbol search, option-chain retrieval,
one-shot market data, and DXLink Greeks. Missing credentials raise
`MarketDataNotConfigured`; the adapter does not import account or order APIs.

### `backend/src/options_emulator/domain.py`

This dependency-light Python model represents explicit option or underlying legs,
their side, quantity, entry price, expiry, and multiplier. It calculates
expiration intrinsic value, entry cash flow, debit/credit summaries, and a price
grid. It is used by `/api/payoff` and tested independently from the web layer.

### `backend/src/options_emulator/market_data_smoke.py`

The smoke command loads optional private environment variables without printing
them, reads symbol search, one chain, quotes, and Greeks, and emits sanitised
metadata. It reports blocked when credentials are absent and never performs an
order or account operation.

## Frontend components

### Entry point and API boundary

`frontend/src/main.tsx` mounts the React `App` in `StrictMode` and loads
`styles.css`. `frontend/src/api.ts` wraps browser `fetch()` calls and converts
non-2xx responses into user-visible errors.

The active UI calls health, symbol search, chain, and quotes. Quote responses
carry the option Greeks consumed by the UI, so `App.tsx` does not currently call
the separate `/api/greeks` route.

### `frontend/src/App.tsx`

This is the current state coordinator and screen. It owns:

- symbol suggestions and debounced chain/underlying loading;
- leg reconciliation when the symbol, chain, expiry, or contract changes;
- pricing-mode refreshes and observed quote application;
- strategy template selection, custom edits, and leg add/remove actions;
- scenario date, IV override, custom entry price, commission, range, and graph
  versus table controls;
- observed and modelled Greek summaries, expiration/pre-expiry outputs, and
  visible provenance labels;
- saving, loading, and deleting browser-local strategies.

The file is therefore intentionally important but increasingly mixed in
responsibility. Changes to one state transition can affect loading, quote
provenance, calculations, and rendering together.

### Calculation modules

`frontend/src/position.ts` is the active browser-side aggregate engine. It
calculates cash flow, commissions, observed Greeks, modelled future Greeks,
expiration profiles, pre-expiry P&L, and sampled graph points. It signs and
weights values by side, quantity, and contract multiplier, and withholds
aggregate outputs when required inputs are incomplete.

`frontend/src/scenario.ts` provides scenario-date bounds, volatility parsing,
Black–Scholes-style option values, and Greeks using the fixed educational 5%
risk-free rate. These are modelled estimates, not broker observations.

The frontend calculation path is separate from the backend `domain.py` and
`/api/payoff` path. They currently duplicate some financial authority and must
retain matching cash-flow, call/put, multiplier, and extrema conventions.

### Templates, quote state, and fixture overlays

`frontend/src/strategyTemplates.ts` is the explicit registry of supported
strategy shapes. It resolves strike roles and near/far expiries only from the
loaded chain, rejects insufficient or incorrectly ordered contracts, and returns
no template when the required layout is unavailable.

`frontend/src/quoteState.ts` applies selected observed prices to legs while
retaining custom entry prices separately. `frontend/src/types.ts` distinguishes
the observed/custom price fields and carries the loaded multiplier.

`frontend/src/marketOverlay.ts` provides deterministic event and liquidity
markers tagged `source: "fixture_overlay"`. `App.tsx` renders them only in
fixture mode. They are synthetic UI context, not external calendars,
broker-observed data, forecasts, or scenario output.

## Data flow for the main builder journey

1. The user types a symbol in the React builder.
2. `App.tsx` calls `fetchSymbolSearch()` after a short debounce.
3. On commit, `App.tsx` requests chain, underlying quotes, and health in
   parallel through Vite's `/api` proxy.
4. FastAPI selects the fixture or explicit tastytrade adapter and returns the
   normalised Pydantic contract.
5. `App.tsx` reconciles each leg against loaded contracts and requests option
   quotes using the selected midpoint/bid/ask/last mode.
6. Quote state stores observed prices and provenance. `position.ts` and
   `scenario.ts` calculate the separate modelled summaries and profiles.
7. React renders observed context, assumptions, modelled outputs, and any
   incomplete/error state. No order or account endpoint is available in this
   flow.

## Persistence and data ownership

- Current builder state, quote responses, chain data, and calculated values live
  in React memory and disappear on page reload.
- Saved strategies are versioned JSON in browser `localStorage` under
  `options-emulator.saved-strategies.v1`.
- Loading a saved strategy restores its inputs and then refreshes the current
  read-only market-data context. It does not call an account or order API.
- The backend has no application database or persistent storage layer.

## External integration and configuration

The only external service dependency is the tastytrade Python SDK declared in
`backend/pyproject.toml`. It is reached only by the backend adapter in explicit
live mode. Credentials are named by `TASTY_CLIENT_SECRET` and
`TASTY_REFRESH_TOKEN`; `TASTYTRADE_IS_TEST` controls its test setting.

`MARKET_DATA_MODE` defaults to `fixture` and accepts explicit `tastytrade`.
Frontend proxy and launcher port/browser settings are `VITE_BACKEND_PORT`,
`OPTION_EMULATOR_BACKEND_PORT`, `OPTION_EMULATOR_FRONTEND_PORT`, and
`OPTION_EMULATOR_OPEN_BROWSER`.

## Testing boundaries

Backend tests in `backend/tests/` cover the domain, API routes, fixture adapter,
live-mode fail-closed behaviour, smoke metadata, and port selection. Frontend
Vitest tests cover templates, quote state, numeric drafts, persistence,
overlays, expiration/pre-expiry calculations, commissions, multipliers, and
observed/modelled Greeks.

The exact commands and browser/live evidence rules are in
[docs/TESTING.md](TESTING.md). Fixture verification is deterministic. A real
browser is required for UI claims; an authenticated smoke check is required for
current live-adapter claims.

## Architectural constraints and risks

- No trading, account mutation, order preview, execution, portfolio sync, or
  recommendations may be added to this project.
- Broker credentials and SDK objects must remain backend-only.
- Observed data and modelled output must stay visibly separate, including saved
  provenance and assumptions.
- The active frontend engine and standalone backend domain/payoff engine can
  drift because both calculate financial results. This is the main duplicate
  responsibility to review before expanding the product.
- `App.tsx` and `market_data.py` each combine several responsibilities. Refactor
  only with focused tests and preserved response/state contracts.
- Profile values are sampled across a finite visible range. The UI must not
  mistake a sampled minimum for theoretical maximum loss when exposure is
  unbounded.
- The top navigation includes Optimizer and Settings labels, but no implemented
  workflows for them were found in the current source.
