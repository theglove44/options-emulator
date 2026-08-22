# Chat report — project instructions and architecture review

**Date:** 21 August 2026, 10:15 BST

**Repository:** `/Users/christaylor/Projects/options-emulator`
**Purpose:** Record the outputs of this chat for later analysis. This report
separates repository evidence, documentation work, verification, and unresolved
risks. It is not a release approval or a recommendation to trade.

## Executive summary

This chat completed two documentation reviews:

1. `project-agents-maintainer` audited and shortened the local project
   instructions, moving detailed testing and domain rules into stable documents.
2. `architecture-xray` traced the real startup, frontend, API, market-data,
   calculation, persistence, and testing flows, then created a plain-English
   project guide and refreshed the technical architecture map.

The result is a clearer documentation set, not a source-code repair. No trading,
account, external, destructive, dependency-installation, commit, or push action
was taken in these reviews.

## Starting state and scope

The repository was already dirty before the architecture work:

- `frontend/src/mockData.ts` was modified.
- `.memsearch/` was untracked.
- `docs/WORKFLOW_REPORT_2026-08-21.md` was untracked.
- The local `AGENTS.md` is ignored by `.gitignore` and therefore does not appear
  in normal Git status output.

Those changes were preserved. The latest available scope note was
`PROJECT_TODO_SCOPE_2026-08-19-integrated-greeks-commissions-overlays.md`; there
was no `PROJECT_TODO_SCOPE_2025*` file, so the stale 2025 instruction reference
was replaced with the supported `PROJECT_TODO_SCOPE_*.md` pattern.

## Work completed

### Project instruction maintenance

`AGENTS.md` was reduced from 91 to 79 lines. It now contains only project facts,
safety boundaries, high-risk rules, links to deeper documentation, and the
project shape.

Detailed content was moved into:

- [docs/TESTING.md](TESTING.md) — setup, backend/frontend checks, browser
  evidence, live adapter evidence, and change-specific minimums.
- [docs/DOMAIN_RULES.md](DOMAIN_RULES.md) — cash-flow signs, multipliers,
  observed/modelled separation, quote state, templates, persistence, and
  semantic test expectations.

The following existing documents were also corrected:

- [README.md](../README.md) no longer describes pre-expiry modelling as future
  work.
- [docs/SPEC.md](SPEC.md) now reflects implemented pre-expiry, future-Greek,
  commission, and custom-price slices.
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) no longer describes the frontend as
  visualisation-only when the active calculations are in frontend modules.

### Architecture X-Ray

Two architecture documents now describe the current checkout:

- [docs/PROJECT_GUIDE.md](PROJECT_GUIDE.md) explains the project for a
  non-programmer, including how to start it, the main workflows, configuration,
  storage, testing, and risks.
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) maps the technical components,
  dependency direction, API routes, data flow, persistence, external adapter,
  and architectural constraints.

## Verified architecture findings

### Runtime and startup

`start_app.sh`:

1. Selects available backend and frontend ports using `scripts/choose_port.py`.
2. Creates missing local environments when necessary.
3. Starts Uvicorn with `MARKET_DATA_MODE=fixture`.
4. Starts Vite with `/api` proxied to the selected backend port.
5. Checks `/api/health` and the frontend root before reporting readiness.

The repository contains no database, worker, job queue, container configuration,
CI workflow, or deployment target in the inspected file inventory.

### Frontend-to-backend flow

The active browser flow is:

```text
React App.tsx
  -> frontend/api.ts
  -> Vite /api proxy
  -> FastAPI api.py
  -> MarketDataAdapter protocol
  -> fixture or explicit tastytrade adapter
  -> normalised response
  -> React state and modelled display values
```

On symbol commit, `App.tsx` requests the chain, underlying quote, and health
status in parallel. It then requests option quotes using the selected midpoint,
bid, ask, or last pricing mode.

The backend exposes `/api/health`, symbol search, chains, expirations, quotes,
Greeks, and a standalone `/api/payoff` route. The current frontend calls health,
symbol search, chains, and quotes. It does not directly call `/api/greeks` or
`/api/payoff`.

### Calculation and state ownership

- `frontend/src/position.ts` owns active browser-side cash flow, commissions,
  expiration profiles, pre-expiry P&L, observed Greeks, and modelled future
  Greeks.
- `frontend/src/scenario.ts` owns the scenario-date bounds, volatility parsing,
  Black–Scholes-style pricing, and modelled Greeks using the fixed educational
  5% rate.
- `backend/src/options_emulator/domain.py` separately owns a dependency-light
  Python expiration-payoff model used by `/api/payoff`.
- `frontend/src/strategyTemplates.ts` resolves named strategy legs against the
  loaded chain and rejects invalid layouts.
- `frontend/src/savedStrategies.ts` stores versioned snapshots in browser
  `localStorage` under `options-emulator.saved-strategies.v1`.
- `frontend/src/marketOverlay.ts` supplies deterministic synthetic event and
  liquidity context only in fixture mode.

### External integration

The only external service is tastytrade, accessed by the backend's lazy-loaded
Python SDK. The adapter uses session authentication, symbol search, option-chain
retrieval, market data, and DXLink Greeks. Missing credentials fail closed.

Relevant environment-variable names are:

- `MARKET_DATA_MODE`
- `TASTY_CLIENT_SECRET`
- `TASTY_REFRESH_TOKEN`
- `TASTYTRADE_IS_TEST`
- `VITE_BACKEND_PORT`
- `OPTION_EMULATOR_BACKEND_PORT`
- `OPTION_EMULATOR_FRONTEND_PORT`
- `OPTION_EMULATOR_OPEN_BROWSER`

No credential values were read or printed.

## Important workflows documented

1. Load a symbol and reconcile existing legs against its chain.
2. Select or edit a strategy template using available contracts.
3. Refresh observed prices under a chosen pricing mode.
4. Inspect expiration, pre-expiry, commission, and Greek outputs.
5. Save, load, and delete browser-local strategy snapshots.
6. Run the optional sanitised read-only tastytrade smoke check.

## High-value risks found

These are findings for analysis, not fixes performed in this chat.

### 1. Duplicate calculation authority

The backend domain/payoff path and active frontend modelling path both calculate
financial results. The frontend does not call `/api/payoff`. They can drift in
cash-flow signs, contract multipliers, call/put branches, commissions, or
extrema handling.

### 2. Large mixed-responsibility modules

`frontend/src/App.tsx` combines loading, reconciliation, state transitions,
calculations, persistence, formatting, and rendering. `backend/src/options_emulator/market_data.py`
combines contracts, fixture generation, quote normalisation, tastytrade access,
and Greeks retrieval. Both are understandable now but become higher-risk as
features grow.

### 3. Finite chart range versus theoretical loss

The frontend profile samples a finite visible range and adds strike breakpoints.
The UI explicitly detects some unbounded profit exposure, but a sampled minimum
must not automatically be presented as theoretical maximum loss for an unbounded
position.

### 4. Placeholder navigation

The visible Optimizer and Settings labels exist in `App.tsx`, but no implemented
workflows were found behind them.

### 5. Browser-only persistence

Saved strategies exist only in the browser that created them. There is no server
backup, cross-device synchronisation, or database retention model.

## Verification performed in this chat

| Check | Result | Evidence |
|---|---|---|
| Shell syntax | PASS | `bash -n start_app.sh` |
| Tracked diff integrity | PASS | `git diff --check` |
| Referenced documentation/source paths | PASS | Explicit `test -f` inventory |
| Edited-document whitespace | PASS | Repository `rg` whitespace check |
| Frontend command declarations | PASS | `cd frontend && npm run` showed `test`, `build`, `dev`, and `preview` |
| Smoke command module | PASS | `cd backend && .venv/bin/python -m options_emulator.market_data_smoke --help` |
| Full backend/frontend tests | NOT RUN | Documentation-only scope |
| Real-browser verification | NOT RUN | No UI behaviour was changed |
| Live tastytrade smoke | NOT RUN | No live external call was authorised or needed |

The packaged `options-emulator-market-data-smoke` console wrapper was absent
from the existing virtual environment, but the module help path worked and the
entry point remains declared in `backend/pyproject.toml`. No dependencies were
installed just to validate documentation.

## Files created or updated by this chat

Created or materially updated:

- `AGENTS.md` — local ignored project instructions.
- `docs/DOMAIN_RULES.md`
- `docs/PROJECT_GUIDE.md`
- `docs/TESTING.md`
- `docs/ARCHITECTURE.md`
- `README.md`
- `docs/SPEC.md`

Preserved but not created by the architecture work:

- `frontend/src/mockData.ts`
- `.memsearch/`
- `docs/WORKFLOW_REPORT_2026-08-21.md`

## Suggested analysis order

1. Read [docs/PROJECT_GUIDE.md](PROJECT_GUIDE.md) to understand the product and
   user journeys.
2. Read the duplicate-authority and finite-range findings above.
3. Compare [frontend/src/position.ts](../frontend/src/position.ts) with
   [backend/src/options_emulator/domain.py](../backend/src/options_emulator/domain.py)
   before planning any modelling expansion.
4. Treat the browser and live-adapter surfaces as separate evidence gates; do
   not infer either from a successful build or fixture test.

## Bottom line

The repository is a coherent local fixture-first research tool with a clear
read-only safety boundary and good deterministic test seams. Its next risks are
architectural rather than setup-related: duplicated financial calculation paths,
an increasingly crowded React coordinator, finite-range risk labels, and
browser-local persistence.
