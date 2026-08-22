# Domain and state rules

These rules protect the meaning of displayed financial figures. The project is
an educational emulator, not an execution or recommendation system.

## Cash flow and payoff

- An opening buy is a debit and an opening sell is a credit. Closing a long or
  short position reverses the corresponding cash-flow sign.
- Keep call and put intrinsic-value branches separate. A call uses
  `max(underlying - strike, 0)`; a put uses `max(strike - underlying, 0)`.
- Apply quantity and the loaded contract multiplier to entry cash flow, payoff,
  Greeks, commissions, and risk calculations. Underlying legs use multiplier
  one; option contracts may supply a multiplier from the chain and must not be
  assumed to be 100 when loaded data says otherwise.
- A finite sampled chart is a display window, not proof of a theoretical limit.
  Include strike breakpoints and analytical extrema, and label unbounded profit
  or loss explicitly.

## Observed data and modelled output

- Keep observed fixture/broker quotes and Greeks separate from modelled
  expiration or pre-expiry output.
- Preserve source, observed timestamp, delayed/stale state, selected pricing
  mode, volatility input, scenario date, custom prices, commissions, and other
  assumptions used by a calculation.
- Fixture overlays are synthetic context. They must be labelled as fixture data,
  not broker observations, forecasts, or modelled scenario output.
- A zero price is valid loaded data. Missing, failed, and not-yet-loaded prices
  need explicit states and must not be collapsed into zero.

## Position and quote state

- A quote refresh must not overwrite a user-entered custom price. It may update
  the retained observed quote separately.
- If a quote is missing or a refresh fails, do not continue presenting stale
  response data or provenance as current. Aggregate output must be withheld
  until every required leg has a valid compatible input.
- When symbol, expiry, or chain changes, reconcile every leg against the new
  chain. Do not retain stale strike, expiry, contract identity, price, or quote
  provenance.
- Mixed-expiry output is only valid where the model explicitly supports it.
  Otherwise show an incomplete state rather than a complete-looking aggregate.

## Templates and persistence

- Resolve strategy templates only against the loaded chain. Validate sufficient
  strikes, unique strikes, ordering, call/put role intersections, and near/far
  expiry availability before creating legs.
- Do not invent, clamp, or silently substitute an unavailable contract.
- If a user edit breaks a recognised template, mark the strategy custom instead
  of retaining a stale template label.
- Saved strategies are versioned browser-local JSON. They may retain position,
  observed-data provenance, and recorded assumptions, but never credentials or
  order/account actions.

## Verification expectations

Tests should cover semantic transitions, not only initial rendering: call/put,
long/short, template, symbol/chain, expiry/strike, quote refresh, custom price,
scenario assumptions, saved strategy, failure, empty-data, and incomplete-input
states. Independent known-value tests should cover shared pricing and normal-CDF
helpers where they influence displayed results.
