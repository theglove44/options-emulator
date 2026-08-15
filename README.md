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

The fixture UI is intentionally usable without backend credentials. The next UI
step is to consume the stable market-data contract rather than calculating a
second copy of the fixture data in the browser.

## Verification

```bash
cd backend
python -m unittest discover -s tests -v

cd ../frontend
npm run build
```

## Current milestone

Milestone 1 now has the read-only adapter contract, fixture implementation, and
live tastytrade implementation for symbol search, expirations, option chains,
quotes, and Greeks. The authenticated live smoke-test record is in
[docs/SMOKE_TEST.md](docs/SMOKE_TEST.md); frontend wiring remains a separate
verification step.

See [docs/SPEC.md](docs/SPEC.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/BACKLOG.md](docs/BACKLOG.md), and [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md).
