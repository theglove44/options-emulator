# Option Emulator

A local, read-only options strategy builder inspired by the interaction model of OptionStrat. The application will use the existing tastytrade API integration to load option chains, quotes, and Greeks, then calculate and visualise projected P&L locally.

The first release is deliberately an emulator, not a trading terminal:

- no order submission;
- no account mutation;
- no live execution path;
- broker credentials stay in the backend;
- every modelled result carries its assumptions and data timestamp.

## Project layout

```text
backend/   Python API, tastytrade adapter, scenario engine, tests
frontend/  React + TypeScript local builder UI
docs/      Product specification, architecture, and backlog
```

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
uvicorn options_emulator.api:app --reload --port 8765
```

The backend defaults to deterministic fixture mode. The read-only tastytrade adapter is selected explicitly with `MARKET_DATA_MODE=tastytrade`; credentials remain in the backend environment and are never sent to the browser.

The reusable authenticated smoke command reads `TASTY_CLIENT_SECRET` and
`TASTY_REFRESH_TOKEN` from the backend environment or a local `backend/.env`
file, and prints only sanitised market-data metadata. It uses symbol search,
chain, quote, and Greeks reads; it never previews, submits, amends, cancels, or
mutates an order or account:

```bash
cd backend
.venv/bin/options-emulator-market-data-smoke --symbol SPY
```

The command exits with a blocked status when private credentials are absent. A
successful command output is required before claiming current authenticated
live verification; fixture/API verification does not substitute for that.

The market-data endpoints are:

- `GET /api/symbols/search?query=ETHA`
- `GET /api/expirations/ETHA`
- `GET /api/chains/ETHA`
- `GET /api/quotes?symbols=ETHA&symbols=<option-symbol>&pricing_mode=midpoint`
- `GET /api/greeks?symbols=<option-symbol>`

Quotes retain the source, observed timestamp, delayed/stale flags, bid, ask,
midpoint, last, selected pricing mode, and available Greeks. Fixture mode uses
the same response shapes without making a broker request.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The fixture UI is intentionally usable without backend credentials. It now
consumes the stable market-data contract for fixture mode: the chain, underlying
quote, selected bid/ask/midpoint price, pricing mode, source timestamp, and
delayed/stale state come from the backend. The pricing selector applies one
explicit mode to the underlying and every option leg. The expiration payoff
remains a clearly labelled local modelled scenario. The current single-leg
builder forms and canonical multi-leg forms—Call Credit Spread, Put Credit
Spread, Long Straddle, Long Strangle, Short Strangle, Iron Condor, Calendar
Spread, and Diagonal Spread—
are represented by an explicit strategy template registry, with Long Call as the
default. Selecting a template resolves its named legs against the loaded chain;
the existing multi-leg seam still allows those legs to be selected, edited, and
removed. Aggregate cash-flow and expiration-profile summaries remain separate
from observed market data. Aggregate expiration output is withheld while a leg
is unpriced or expiries are not aligned; multi-expiry and pre-expiry modelling
remain later work. The payoff panel supports graph and table display modes, a
zoomable signed profit/loss graph with breakeven markers, and a hover readout
for underlying price and modelled P&L. Each active leg also has an explicit
contract-backed strike picker rather than a continuous slider.

## Verification

```bash
cd backend
python -m unittest discover -s tests -v

cd ../frontend
npm run build
```

## Current milestone

Milestone 1, the read-only market-data foundation, is complete: the normalised
adapter contract, deterministic fixture implementation, live tastytrade
implementation, authenticated smoke command, and fixture frontend wiring cover
symbol search, expirations, option chains, quotes, and Greeks. No order or
account APIs are included.

The current Milestone 2 builder slice is also implemented in fixture mode: the
strategy registry covers the existing single-leg forms plus Call Credit Spread,
Put Credit Spread, Long Straddle, Long Strangle, Short Strangle, Iron Condor,
Calendar Spread, and Diagonal Spread; explicit multi-leg editing,
user-selectable bid/ask/midpoint pricing, aggregate cash-flow and expiration
payoff summaries, and the signed, zoomable graph/table display are verified in
the current builder.
Remaining builder work is listed in [docs/BACKLOG.md](docs/BACKLOG.md),
including pre-expiry modelling and saved strategies.

The existing authenticated live smoke-test record is in
[docs/SMOKE_TEST.md](docs/SMOKE_TEST.md); this checkout did not have the private
backend environment, so no new live-authenticated result is claimed here.

See [docs/SPEC.md](docs/SPEC.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/BACKLOG.md](docs/BACKLOG.md), and [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md).
