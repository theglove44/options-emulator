# Read-only tastytrade smoke test

This is the manual smoke-test record for the backend market-data adapter. It
does not submit, preview, amend, cancel, or otherwise mutate an order or
account.

## Configuration

Keep credentials in `backend/.env`. The file is ignored by the repository's
`.gitignore` and should remain local. It is currently protected with owner-only
permissions (`600`). Do not paste credential values into source, documentation,
terminal output, or issue reports.

The project defaults to fixture mode:

```text
MARKET_DATA_MODE=fixture
```

For a live backend run, set `MARKET_DATA_MODE=tastytrade` in the private
environment or override it for that process. The smoke test used the existing
credentials from `backend/.env` and overrode only the mode in memory; the file
itself was not changed.

## Checks

The adapter was exercised directly against tastytrade for `SPY`:

1. Symbol search.
2. Option-chain retrieval and expiration normalisation.
3. Underlying and option quote retrieval using midpoint pricing.
4. DXLink Greeks retrieval for an option contract.

The test reported only sanitised metadata and never printed credential values.

## Verified record

Run date: 15 August 2026, Europe/London.

- Authentication and read-only API access: passed.
- Symbol search: 17 `SPY` results returned.
- Option chain: 35 expirations and 14,588 contracts returned.
- Quotes: underlying and option quote returned with bid, ask, last, and a
  selected price.
- Greeks: option Greeks returned, including delta.
- Sandbox mode: false.
- Source: `tastytrade`.

The returned market data was marked stale because the check ran outside the
active US market session over the weekend. This is expected; the adapter keeps
the source timestamp and exposes `stale=true` rather than presenting the data
as current.

## API-level run

To run the local API against the private live configuration:

```bash
cd backend
source .venv/bin/activate
set -a
source .env
set +a
MARKET_DATA_MODE=tastytrade uvicorn options_emulator.api:app --host 127.0.0.1 --port 8765
```

Then use the read-only routes documented in the [README](../README.md): symbol
search, expirations, chains, quotes, and Greeks. Stop the server after the
check. No authenticated live smoke test should be described as current when
the response is marked stale.
