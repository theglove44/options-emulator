# Architecture

## Runtime shape

```text
tastytrade Session (backend only)
        |
        v
read-only market-data adapter
        |
        v
normalised chain / quote / Greeks contract
        |
        +--> scenario and expiration P&L engine
        |          |
        |          +--> summary metrics
        |          +--> payoff graph
        |          +--> price/date table
        |
        v
localhost API <--> React builder UI
        |
        v
browser-local saved strategies (versioned JSON in localStorage)
```

## Backend boundaries

### Market data adapter

The adapter owns authentication, chain retrieval, quote normalisation, and Greeks subscription. It must not import order classes or execution clients. The browser receives normalised market data only.

Each quote should retain:

- symbol and OCC/streamer identifiers;
- expiration, strike, call/put;
- bid, ask, mark, last, and the selected pricing source;
- IV, volume, open interest, and Greeks where available;
- observed timestamp and delayed/stale status.

The `/api/quotes` response also exposes `spot_price` separately from its item
list. It is sourced from the requested equity quote's last price, with the
selected equity price as a fallback, and is used by the builder for the spot
marker and chain strike context. Option Greeks, including delta, remain on the
normalised option quote items.

The current HTTP contract exposes this as `/api/symbols/search`,
`/api/expirations/{symbol}`, `/api/chains/{symbol}`, `/api/quotes`, and
`/api/greeks`. `MARKET_DATA_MODE=fixture` is the default; live mode is explicit
and requires `TASTY_CLIENT_SECRET` and `TASTY_REFRESH_TOKEN` in the backend
environment. The tastytrade adapter uses symbol search and option-chain API
calls, one-shot market data for bid/ask/last/volume, and DXLink for Greeks.
It does not import account or order functionality.

### Domain model

A position is a list of explicit legs. An option leg contains side, quantity, contract, entry price, and optional scenario IV. An underlying leg uses a multiplier of one; standard option contracts default to a multiplier of 100.

### Scenario engine

- Expiration P&L uses intrinsic value and the recorded entry price.
- Pre-expiration P&L uses a documented option-pricing model; it is not presented as observed market value.
- Aggregate Greeks are signed by side and quantity and retain the unit convention used by the adapter.
- Probability of profit is derived from an explicit distribution assumption and is not treated as a broker-provided fact.

## Frontend boundaries

The frontend owns interaction state and visualisation only. It should not know how tastytrade authentication works and should not calculate a different result from the backend for the same scenario request.

Fixture mode is a first-class mode, not a temporary hack. It allows UI and domain verification when markets are closed, credentials are unavailable, or a reproducible test case is needed.

Saved strategies are a browser-local JSON snapshot of the current position and
recorded assumptions. Each snapshot retains observed market-data provenance,
including source, timestamp, pricing mode and delayed/stale state. The browser
does not receive broker credentials, and loading or deleting a snapshot does not
call an account or order endpoint.

## Safety boundary

The emulator is research-only. No endpoint, dependency, or UI action should place, amend, cancel, or preview a broker order. If trading functionality is ever proposed, it must be a separate project and explicit approval gate.
