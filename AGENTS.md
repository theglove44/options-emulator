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

## Testing

Run the relevant checks after every change, before claiming completion. A change is not done until its checks pass.

### Backend (Python)

| Changed | Command | Why |
|---|---|---|
| Domain or pricing code (`src/options_emulator/domain.py`) | `cd backend && source .venv/bin/activate && python -m unittest discover -s tests -v` | P&L math is the product; a silent calculation bug is worse than a crash. |
| Market-data adapter (`src/options_emulator/market_data.py`) | same command | Verifies fixture mode stays first-class and live mode fails closed without credentials. |
| API or response contract (`src/options_emulator/api.py`) | same command | The frontend consumes this contract; a shape change breaks the UI with a green backend. |
| Any backend change | `ruff check src tests` | Lint gate (line-length 100, py311). |

If `backend/.venv` does not exist, create it first: `cd backend && python3 -m venv .venv && source .venv/bin/activate && python -m pip install -e '.[dev]'`.

### Frontend (TypeScript/React)

| Changed | Command | Why |
|---|---|---|
| Any UI code | `cd frontend && npm run build` | Strict tsc + Vite build catches type errors and broken imports. |
| Any UI change | Browser check: run `npm run dev`, load the page, verify the changed behaviour | The build cannot prove the UI renders or that data flows. |

### Screenshot rule

- Save browser verification screenshots as `.png` in a new directory called `images` at the project root.
- Use clear filenames identifying the stage of development (e.g. `01-strategy-builder-legs.png`).
- Do not state a successful build until the browser check has passed and screenshots are saved.

### Live tastytrade verification

- Do not claim live tastytrade verification unless an authenticated, read-only market-data smoke test has passed.
- Run the smoke test only when the adapter itself changed (auth, chain parsing, DXLink, quotes).
- Record the result in `docs/SMOKE_TEST.md` with the run date; mark data stale if outside US market hours.
- Credentials stay in `backend/.env` (owner-only permissions); never print or commit them.

### Definition of done

- Backend change: unit tests pass, `ruff check src tests` is clean, and `ruff format --check src tests` passes.
- Frontend change: production build passes and browser check passed with screenshots saved.
- Adapter change: the above plus a recorded live smoke test.

## Lessons learnt and fixes for future development

### Financial and modelling invariants

- Preserve the cash-flow convention consistently: opening a long position is a debit, opening a short position is a credit, and closing trades use the opposite signs. Cover both long and short call/put cases with unit tests.
- Carry the contract multiplier from the loaded instrument or chain data. Do not hard-code `100` into pricing, P&L, or risk calculations.
- Keep quote state separate from user-entered position state. A zero price is valid data; missing, failed, and not-yet-loaded prices must be represented explicitly.
- Keep call and put intrinsic-value branches separate. A shared shortcut must not silently change put or short-position behaviour.
- Include strike breakpoints and analytical extrema when calculating payoff ranges. Do not infer theoretical maximum profit or loss solely from a finite chart window; identify unbounded exposure explicitly.

### Position, chain, and template state

- Quote refreshes must not overwrite a user-edited leg unless the user explicitly requests that behaviour.
- When the symbol, expiry, or chain changes, reconcile every leg against the new chain. Never leave a leg carrying stale strikes, expiries, or quote provenance.
- Multi-leg aggregate output must be gated on valid inputs. Do not present a complete aggregate result when a leg is unpriced or when the model does not support mixed expiries.
- Resolve strategy templates only from the loaded chain. Do not invent, clamp, or silently substitute unavailable strikes.
- Validate template prerequisites explicitly: sufficient strikes, unique strikes, correct ordering, and valid call/put role intersections.
- Preserve the difference between a recognised template and a custom user-built strategy. If a leg edit breaks template membership, mark the strategy custom rather than leaving a stale template label.
- Clear stale response data and provenance when a refresh fails or returns no usable data.

### Verification discipline

- Test semantic state transitions, not only the initial render. At minimum, verify call/put changes, long/short changes, template changes, symbol or chain changes, expiry and strike edits, refreshes, and failure or empty-data states.
- After changing source code, restart the development server from the exact worktree being reviewed and use a fresh browser page before drawing conclusions from the UI.
- Keep browser verification focused on observable behaviour: the displayed values, labels, disabled states, error states, and downstream calculations must all update consistently.
- Run both lint and formatting checks for backend changes: `ruff check src tests` and `ruff format --check src tests`.
- Keep fixture mode as the default verification path. Live read-only market-data checks are an additional adapter check, not a replacement for deterministic fixture and unit tests.

## Style

- Use UK English in user-facing text.
- Prefer simple, explicit code over abstractions that hide financial calculations.
- Treat all figures as educational estimates, not investment advice.
