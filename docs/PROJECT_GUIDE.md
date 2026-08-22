# Option Emulator project guide

## What this project is for

Option Emulator is a local, read-only workspace for constructing and studying
options strategies. It loads an option chain and observed quote context from
deterministic fixture data by default, or from the read-only tastytrade adapter
when explicitly configured. It then calculates educational scenario values in
the browser.

It is deliberately not a trading terminal. There is no order preview or
submission, account access, portfolio synchronisation, investment advice,
background worker, database, or deployment configuration in this repository.

## Start it locally

From the project root:

```bash
./start_app.sh
```

The launcher prepares local dependencies when needed, starts the FastAPI backend
and Vite frontend in fixture mode, chooses a free localhost port if the defaults
are busy, and opens the resulting browser URL. Set
`OPTION_EMULATOR_OPEN_BROWSER=0` when checking the servers without opening a
browser.

The normal default ports are backend `8765` and frontend `5173`. Vite proxies
frontend `/api` calls to the backend port through `VITE_BACKEND_PORT`.

## The major parts

- `start_app.sh` is the local runner. It starts Uvicorn and Vite, checks
  `/api/health` and the frontend root, and stops both child processes together.
- `frontend/src/App.tsx` is the current builder screen and state coordinator. It
  handles symbol loading, chain/quote refresh, leg editing, templates, scenario
  controls, saved strategies, and rendering.
- `frontend/src/api.ts` is the small browser API client. It calls health, symbol
  search, chain, and quote endpoints. The current UI receives Greeks through
  quote responses rather than calling `/api/greeks` directly.
- `backend/src/options_emulator/api.py` exposes the FastAPI routes and selects
  the configured market-data adapter.
- `backend/src/options_emulator/market_data.py` defines the normalised response
  shapes and the two adapter implementations: deterministic fixture data and
  read-only tastytrade data.
- `frontend/src/position.ts` and `frontend/src/scenario.ts` contain the active
  browser-side P&L, pre-expiry pricing, commission, and Greeks calculations.
- `frontend/src/strategyTemplates.ts` resolves named strategy legs against the
  loaded chain. `frontend/src/savedStrategies.ts` validates and stores local
  strategy snapshots.
- `backend/src/options_emulator/domain.py` is a separate, dependency-light
  Python model for expiration payoff arithmetic and the standalone payoff API.

## Important workflows

### 1. Load a symbol

Typing a symbol debounces a symbol-search request. Choosing or committing a
symbol then loads the chain, underlying quote, and health status together. The
frontend reconciles existing legs against the new chain and clears unusable
quote state on a failed load.

### 2. Build or edit a strategy

The template selector resolves supported calls, puts, spreads, straddles,
strangles, calendars, diagonals, and iron condors from actual chain contracts.
Users can edit expiry, strike, call/put type, buy/sell side, quantity, and add or
remove legs. An edit that no longer matches a recognised template becomes a
custom position.

### 3. Refresh observed prices

The pricing selector requests midpoint, bid, ask, or last prices for the
selected contracts. The UI keeps the selected observed quote, source timestamp,
delayed/stale state, and observed Greeks separate from custom entry prices and
scenario assumptions. Contract multipliers come from the chain.

### 4. Inspect modelled results

The browser calculates entry cash flow, commissions, expiration intrinsic-value
P&L, breakeven, a finite graph/table display range, observed aggregate Greeks,
pre-expiry modelled P&L, and modelled future Greeks. Pre-expiry output uses the
scenario date, per-leg volatility, and the fixed educational 5% rate; it is not
presented as observed market value.

### 5. Save and reload a strategy

Save stores a versioned JSON snapshot in this browser's `localStorage`, under
`options-emulator.saved-strategies.v1`. The snapshot includes legs, template
identity, quote provenance, pricing mode, scenario date, IV overrides, custom
prices, and commission assumptions. Loading restores those inputs and refreshes
the read-only market-data context. Delete removes only that browser record.

### 6. Run the adapter smoke check

The optional authenticated smoke command reads symbol search, a chain, quotes,
and Greeks. It emits sanitised metadata only and fails closed when the private
credentials are absent. It never previews, submits, amends, cancels, or mutates
an order or account.

## External services and configuration

The only external service is tastytrade, accessed by the backend's lazy-loaded
Python SDK. Fixture mode avoids broker access and is the default. Live mode is
selected with `MARKET_DATA_MODE=tastytrade`.

Private configuration names are:

- `TASTY_CLIENT_SECRET` and `TASTY_REFRESH_TOKEN` — backend authentication.
- `TASTYTRADE_IS_TEST` — selects the tastytrade test/sandbox setting.
- `MARKET_DATA_MODE` — `fixture` or explicit `tastytrade`.
- `VITE_BACKEND_PORT` — frontend development proxy target.
- `OPTION_EMULATOR_BACKEND_PORT`, `OPTION_EMULATOR_FRONTEND_PORT`, and
  `OPTION_EMULATOR_OPEN_BROWSER` — local launcher controls.

Credentials belong only in the private backend environment. The browser receives
normalised data, never credential values or broker SDK objects.

## Where data lives

- React state holds the active chain, quotes, legs, assumptions, and calculated
  display values for the current page.
- The backend holds no application database or long-lived strategy store.
- Saved strategies persist only in browser `localStorage`.
- Fixture chains, quotes, Greeks, event markers, and liquidity overlays are
  deterministic source-controlled test data. The overlays are synthetic context,
  not broker observations or forecasts.
- Live responses carry source, observed time, pricing mode, delayed state, and
  stale state so the UI can show the limits of the data.

## Testing and deeper documentation

Use [docs/TESTING.md](TESTING.md) for exact commands and browser evidence rules.
Use [docs/DOMAIN_RULES.md](DOMAIN_RULES.md) before changing financial arithmetic
or state transitions. [docs/ARCHITECTURE.md](ARCHITECTURE.md) contains the
technical dependency map. [docs/SPEC.md](SPEC.md) and [docs/BACKLOG.md](BACKLOG.md)
describe product scope. [docs/SMOKE_TEST.md](SMOKE_TEST.md) records the
authenticated adapter check.

## Areas that are easy to break

- The backend domain/payoff path and active frontend modelling path contain
  separate calculation implementations. The frontend does not currently call
  `/api/payoff`; their cash-flow, multiplier, call/put, and extrema conventions
  must stay aligned.
- `frontend/src/App.tsx` combines data loading, reconciliation, calculations,
  persistence actions, and rendering. A state change can affect several visible
  outputs at once.
- The graph samples a finite price window. It must not be treated as proof of a
  theoretical maximum loss or profit without analytical handling of unbounded
  exposure.
- The visible Optimizer and Settings navigation labels do not currently have
  implemented workflows.
- A green build does not prove the UI works. A real-browser check is required
  for UI changes, with visible state, console errors, and screenshots checked.
