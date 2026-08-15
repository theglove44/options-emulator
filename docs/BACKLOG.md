# Backlog

## Now

- [x] Create repository structure and project rules.
- [x] Add fixture-backed Long Call builder shell.
- [x] Add tested expiration P&L domain model.
- [x] Connect a read-only tastytrade chain adapter behind a normalised contract.
- [x] Add fixture and tastytrade routes for symbol search, expirations, chains, quotes, and Greeks.
- [x] Add an authenticated, read-only market-data smoke command.
- [x] Replace fixture quotes through the stable API contract.

## Next

- [x] Add strategy template registry for the existing Long/Short Call and Put single-leg shell.
- [x] Add explicit multi-leg editing and aggregate position summary seam to the current builder.
- [ ] Add vertical spreads, straddles, strangles, and iron condors.
- [ ] Add graph/table display switch.
- [ ] Add bid/ask versus midpoint pricing mode.
- [ ] Add scenario date and implied-volatility controls.
- [ ] Add local saved strategies.

## Later

- [ ] Pre-expiry pricing model with per-leg IV.
- [ ] Net and future Greeks.
- [ ] Commissions and custom prices.
- [ ] Market events and liquidity overlays.
- [ ] Historical IV and saved-trade tracking.
- [ ] Optimizer.
- [ ] Separate flow-data investigation.

## Explicitly out of scope

- [ ] Broker order submission.
- [ ] Live execution.
- [ ] Account mutation.
