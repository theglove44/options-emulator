# Testing and verification

Option Emulator is read-only. Fixture mode is the deterministic path for local
verification; live tastytrade checks are an additional adapter check, not a
replacement for unit, API, or fixture checks.

## Setup

The launcher prepares missing environments, but do not install dependencies just
to audit documentation. For manual setup, use the commands in the README:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'

cd ../frontend
npm ci
```

Credentials, if needed, stay in the private `backend/.env` file. Never include
their values in output or reports.

## Deterministic checks

Run the relevant group after source changes.

### Backend

```bash
cd backend
source .venv/bin/activate
python -m unittest discover -s tests -v
ruff check src tests
ruff format --check src tests
```

The suite covers the domain model, API contract, fixture adapter, smoke-command
metadata, and launcher port selection. Ruff uses Python 3.11 syntax and a
100-character line limit, as declared in `backend/pyproject.toml`.

### Frontend

```bash
cd frontend
npm test -- --run
npm run build
```

The test command runs Vitest. The build runs strict TypeScript checking followed
by the Vite production build.

### Launcher and diff integrity

```bash
bash -n start_app.sh
git diff --check
```

For fixture integration, start the exact checkout under review with
`OPTION_EMULATOR_OPEN_BROWSER=0 ./start_app.sh`, check the reported local URL,
the `/api/health` response, and the visible fixture UI, then stop the processes
cleanly.

## Browser evidence

UI verification must use a real browser. Exercise the changed interaction and
check visible values, labels, disabled states, error states, downstream output,
and browser console errors. Restart the development server from the exact
checkout and use a fresh page before checking a change.

Save screenshots from the current run under `images/` at the repository root,
using a clear stage-based filename such as
`images/01-strategy-builder-legs.png`. Historical screenshots are not evidence
for a new run. If a browser executable or other required runtime is missing,
mark browser verification `NOT VERIFIED` rather than inferring success from a
build.

## Live adapter evidence

Run this only when the market-data adapter changes authentication, chain
parsing, DXLink, quotes, or related response normalisation:

```bash
cd backend
.venv/bin/options-emulator-market-data-smoke --symbol SPY
```

The command performs symbol-search, chain, quote, and Greeks reads only. It
returns sanitised metadata and exits blocked when private credentials are
absent. Record the run date and whether returned data was stale in
`docs/SMOKE_TEST.md`. Do not call a stale result current.

## Change-specific minimums

- Backend source change: backend tests, Ruff lint, and Ruff format check.
- Frontend source change: frontend tests, frontend build, and browser evidence.
- Adapter source change: all applicable deterministic checks plus the recorded
  authenticated read-only smoke test.
- Documentation-only change: verify referenced paths and commands, run
  `bash -n start_app.sh` and `git diff --check` when the documentation names
  launcher or repository commands.
