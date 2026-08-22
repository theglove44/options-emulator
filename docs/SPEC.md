# Product specification

## Product goal

Provide a fast local workspace for constructing and analysing options strategies from real tastytrade market data, with an OptionStrat-style visual payoff surface and enough transparency to understand how each result was produced.

## Primary workflow

1. Search for an underlying.
2. Load its expirations and option chain.
3. Choose a strategy template or add individual legs.
4. Select expiry, strike, side, quantity, pricing mode, and scenario assumptions.
5. Recalculate the position immediately.
6. Inspect summary metrics, an expiration payoff curve, and an expiration-only P&L table.
7. Save the strategy locally for later review.

## Milestone 0: project and fixture vertical slice

Acceptance criteria:

- The project is runnable locally from documented commands.
- The frontend renders a dark builder shell without broker credentials.
- A Long Call fixture has an editable expiry, strike, quantity, and buy/sell side.
- The UI shows net debit, max loss, breakeven, and a payoff graph.
- The backend domain model has unit tests for long and short option expiration P&L.
- No code path can submit an order.

## Milestone 1: read-only tastytrade data

- Searchable underlying lookup.
- Expiration list and normalised option chain.
- Quote source selection: midpoint or bid/ask.
- Live mark, bid, ask, last, IV, volume, open interest, and Greeks.
- Explicit data timestamp and delayed/stale status.
- Read-only authenticated smoke test.

## Milestone 2: useful strategy builder — current fixture slice

- Long call, long put, call/put credit spreads, long/short strangles, straddles, iron condors, calendars, and diagonals.
- Add/remove/reorder legs.
- Underlying stock legs.
- Multiple expirations for calendars and diagonals.
- Aggregate Greeks with documented units.
- Pre-expiry scenario pricing using an explicit model and per-leg IV, labelled
  separately from observed market data.
- Table and graph display modes.
- Local saved strategies.

The current builder also keeps observed broker Greeks separate from modelled
future Greeks, preserves custom entry prices and educational commissions as
modelled assumptions, and labels fixture-only market overlays as synthetic.
Scenario date and implied-volatility controls drive the separate pre-expiry
modelled output; the expiration payoff remains an intrinsic-value calculation.

Local saved strategies use browser-local versioned JSON. A saved snapshot
contains the explicit legs, pricing mode, observed-data provenance and recorded
scenario assumptions; loading refreshes the read-only market-data context and
does not perform an account or order operation.

## Remaining analysis work

- Historical IV and saved-trade tracking.
- Optimizer.
- Separate flow-data investigation.

## Later, separate data products

Optimizer, unusual options flow, news flow, congress/insider flow, and mobile notifications are deliberately later. Tastytrade chain and Greeks data alone are not sufficient to reproduce OPRA-style consolidated flow detection.

## Non-goals

- Automated trading.
- Order preview or submission.
- Portfolio synchronisation.
- Investment recommendations.
- Copying OptionStrat branding, private implementation, or proprietary data.
