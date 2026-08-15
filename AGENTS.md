# Option Emulator project instructions

## Purpose

Option Emulator is a local, read-only options strategy visualiser. It uses tastytrade market data for chains, quotes, and Greeks, then calculates projected strategy outcomes locally.

## Boundaries

- Never add order submission, account mutation, or live trading to this project.
- Keep tastytrade credentials in the backend environment only; never send them to the browser.
- Label observed market data separately from modelled scenario output.
- Preserve the source timestamp, pricing mode, volatility input, and assumptions for every calculation.
- Keep mock/fixture mode available so the UI and calculation engine can be verified without broker access.
- Preserve unrelated work and make focused changes.

## Verification

- Run the backend unit tests after changing domain or pricing code.
- Run the frontend production build after changing the UI.
- Do not claim live tastytrade verification unless an authenticated, read-only market-data smoke test has passed.
- when testing the front end url use the browser and take screen shots to confirm the changes have worked before stating a successful build.

## Style

- Use UK English in user-facing text.
- Prefer simple, explicit code over abstractions that hide financial calculations.
- Treat all figures as educational estimates, not investment advice.
