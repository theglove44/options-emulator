# Skills workflow report

**Project:** Option Emulator
**Date:** 21 August 2026
**Purpose:** Analyse the first end-to-end workflow using the local Codex skills for project maintenance, architecture, testing, implementation review, simplification, browser QA, and release gating.

## Executive summary

The workflow was useful and evidence-led. It established a green deterministic baseline, found several real architectural and correctness concerns, removed one confirmed dead frontend wrapper, and ended with an honest release result.

The final candidate was:

- one file changed: `frontend/src/mockData.ts`;
- one unused `buildProfile()` wrapper removed;
- no dependency, API, persisted-data, or user-facing behaviour changes;
- backend tests, frontend tests, lint, formatting, build, launcher syntax, fixture startup, and diff checks all passed;
- browser verification was not completed because the Playwright browser executable was unavailable;
- no live tastytrade request, credential access, commit, push, or production action was performed.

The release-gate result was therefore:

> **AMBER — evidence incomplete or non-blocking concerns**

The dead-code change itself is low risk. The repository is not yet fully release-ready as a product because browser evidence is missing and the implementation review identified two material correctness risks: stale quote state after an incomplete refresh, and finite chart-window values being presented as “Max loss” without an unbounded-loss result.

## Workflow chronology

### 1. `project-agents-maintainer`

**Purpose:** Check whether the project instructions were short, accurate, current, and supported by repository evidence.

**What was verified:**

- the project is a local, read-only options visualiser;
- fixture mode is available and is the deterministic verification path;
- credentials are intended to remain in the backend;
- the repository supports Python/FastAPI, React/TypeScript/Vite, unittest, Vitest, Ruff, and a local launcher;
- the current scope file is dated `PROJECT_TODO_SCOPE_2026-08-19-integrated-greeks-commissions-overlays.md`.

**Findings:**

- `AGENTS.md` is longer than a project operating map;
- it contains the stale reference `PROJECT_TODO_SCOPE_2025`;
- detailed testing and domain rules would fit better in stable files under `docs/`;
- the file is locally ignored by Git, so it is an intentional local instruction artefact rather than a tracked project file.

**Outcome:** No edit was made. A multi-file rewrite was proposed, but the project instructions required an explicit `go` before making multiple-file changes. The next user message changed workflow rather than approving that plan.

### 2. `architecture-xray`

**Purpose:** Trace the real system rather than relying on filenames or stale architecture prose.

**Important discoveries:**

- the active flow is `React App → frontend API client → FastAPI route → fixture or tastytrade adapter → normalised response → React state`;
- active expiration P&L, pre-expiry values, Greeks aggregation, commissions, and graph data are calculated in the frontend under `frontend/src/position.ts` and `frontend/src/scenario.ts`;
- the backend also contains a `Position` model and `/api/payoff` route, but the current frontend does not call that route;
- saved strategies use browser `localStorage`, not a database;
- no worker, job queue, deployment configuration, order API, or account mutation path was found;
- `backend/src/options_emulator/market_data.py` combines contracts, fixture generation, and the live tastytrade adapter in one large module;
- `frontend/src/App.tsx` is approximately 1,196 lines and combines loading, reconciliation, state transitions, calculations, persistence actions, formatting, and rendering.

**Outcome:** No edit was made. A two-file documentation update was proposed, but it also required approval before editing.

### 3. `stack-aware-test`

**Purpose:** Use the actual project stack and its repository-defined commands.

**Baseline and post-change evidence:**

```text
cd backend && source .venv/bin/activate && python -m unittest discover -s tests -v
Ran 24 tests ... OK

cd backend && source .venv/bin/activate && ruff check src tests
All checks passed!

cd backend && source .venv/bin/activate && ruff format --check src tests
11 files already formatted

cd frontend && npm test -- --run
Test Files  7 passed (7)
Tests       49 passed (49)

cd frontend && npm run build
Vite built 25 modules successfully.

bash -n start_app.sh
exit code 0

git diff --check
exit code 0
```

The backend test run emitted an existing non-failing Starlette deprecation warning concerning `httpx2`.

**Outcome:** All deterministic automated gates passed. Browser verification was correctly kept separate rather than inferred from the build.

### 4. `implementation-review`

**Purpose:** Assess whether the implementation is sensible for its actual stack, not merely whether tests pass.

**Positive findings:**

- the fixture and tastytrade adapters share a clear protocol boundary;
- tastytrade imports are lazy, so fixture mode remains usable without broker credentials;
- the backend fails closed when live credentials are absent;
- normalised Pydantic responses preserve source, timestamp, stale/delayed state, and pricing mode;
- strategy templates are explicit and resolve against the loaded chain;
- most important financial calculations have focused semantic tests;
- no unnecessary state library or new service layer is needed for the current scope.

**Material findings:**

1. **Stale quote state.** `applyObservedPrices()` leaves an existing leg unchanged when the selected quote is missing. The quote-fetch error path also reports the error without clearing the leg’s prior loaded price. This can allow old prices to continue driving modelled output. The code path is verified by inspection; runtime browser confirmation was unavailable.

2. **Finite “Max loss”.** The profile samples a finite visible price range and adds strike breakpoints. The UI uses the sampled minimum as “Max loss”, but only unbounded profit is detected explicitly. A short call can therefore show a finite loss value where the theoretical loss is unbounded.

3. **Duplicate calculation authority.** The backend domain/payoff path and the active frontend modelling path can drift because both contain calculation logic and the frontend does not call the backend payoff endpoint.

4. **Large mixed-responsibility files.** `App.tsx` and `market_data.py` are maintainable for a small prototype but are becoming risky as more modelling and state transitions are added.

5. **Floating frontend dependency declarations.** React, TypeScript, Vite, and related packages use `latest` in `package.json`. The lockfile gives current reproducibility, but future dependency refreshes can change major behaviour unexpectedly.

**Verdict from the review:** mostly sensible with targeted cleanup.

### 5. `code-simplifier`

**Scope selected:** only high-confidence deletion was allowed. Broader structural refactors were deliberately left alone.

**Removed:**

- `buildProfile()` from `frontend/src/mockData.ts`;
- its unused `ProfilePoint` type import;
- its unused `buildPositionProfile` import.

**Why this was safe:** repository-wide search found no callers in production code or tests. The wrapper added no behaviour beyond calling the existing position function.

**Metrics:**

- files touched: 1;
- file size: 21 lines to 16 lines;
- diff: 1 insertion and 6 deletions;
- dependencies changed: 0;
- tests removed: 0;
- public API or persisted format changed: no.

**Outcome:** Frontend tests and build passed after the deletion. The backend gates were rerun and remained green.

### 6. `browser-qa`

**Purpose:** Prove visible behaviour in a real browser rather than treating server readiness or a build as UI proof.

**What was done:**

- started the exact worktree with `OPTION_EMULATOR_OPEN_BROWSER=0 ./start_app.sh`;
- confirmed Vite on port 5173 and Uvicorn on port 8765;
- confirmed fixture-mode health and chain responses with `curl`;
- loaded the bundled Playwright library;
- attempted to launch a headless Chromium browser;
- stopped the temporary servers cleanly.

**Blocker:** Playwright could not launch because its browser executable was absent:

```text
browserType.launch: Executable doesn't exist at .../chrome-headless-shell-mac-arm64/chrome-headless-shell
```

No page was opened, no interactions were performed, and no screenshot was created by that run. The existing `images/` directory contains historical screenshots, but they were not treated as evidence for this run.

**Outcome:** Browser UI is `NOT VERIFIED`.

### 7. `release-gate`

**Candidate:** the one-file dead-code removal in `frontend/src/mockData.ts`.

| Gate | Result |
|---|---|
| Backend tests | PASS |
| Backend Ruff lint | PASS |
| Backend Ruff format | PASS |
| Frontend tests | PASS |
| Frontend build/type check | PASS |
| Launcher syntax | PASS |
| Fixture launcher/integration | PASS |
| Diff integrity | PASS |
| Browser UI | NOT VERIFIED |
| Live tastytrade | NOT RUN, correctly out of scope |
| Documentation freshness | AMBER because of the pre-existing stale scope-file pointer |

**Final gate result:** `AMBER — evidence incomplete or non-blocking concerns`.

## What this workflow did well

### Evidence was kept separate from confidence

The workflow consistently distinguished:

- source inspection from runtime verification;
- fixture/API checks from real-browser checks;
- observed broker data from modelled output;
- current checkout evidence from historical memory;
- a scoped dead-code change from broader product risks.

That is particularly important for a financial modelling tool where a green build does not prove that displayed numbers are correct.

### The skills formed a useful ladder

The order moved from project contract, to architecture, to tests, to implementation quality, to a bounded simplification, to browser QA, and finally to release readiness. Each later phase had better evidence than the previous phase.

### The workflow avoided unsafe expansion

No credentials were printed. No live tastytrade request was made. No order, account, deployment, commit, push, dependency installation, or destructive operation was performed. The only source edit was a proven dead-code deletion.

### The release gate did not hide the browser gap

The missing browser runtime was reported as `NOT VERIFIED`, not silently treated as a passing UI test. That is the correct outcome for this project’s own definition of done.

## What could be improved in the workflow

### 1. Decide the scope and artefact earlier

The first two skills identified documentation work, but both stopped at a proposed plan because the project required approval for multi-file changes. The workflow then moved to testing and code simplification without resolving whether the goal was:

- maintain project instructions;
- create architecture documentation;
- simplify code;
- release the current candidate; or
- analyse the workflow itself.

**Improvement:** begin each run with a one-line scope such as: “Review and simplify only; no documentation changes; final output is a release-gate report.”

### 2. Establish browser capability before the UI phase

The browser blocker was discovered only when browser QA was already underway. Playwright’s JavaScript library was available, but its browser binary was not.

**Improvement:** add a preflight check before starting browser QA:

```text
browser library available
browser executable available
dev server available
```

If the executable is missing, record the blocker immediately and either obtain explicit approval to provision it or mark the UI gate as unavailable.

### 3. Avoid repeating the full baseline unnecessarily

The same backend and frontend checks were run in several consecutive turns with no intervening source change. This improved confidence but added time and output without adding much independent evidence.

**Improvement:** record a baseline once, rerun only affected checks after each change, and run the full matrix once before release gating. Keep the exact baseline output in the final report.

### 4. Separate review findings from simplification candidates

The implementation review found correctness risks, but the simplifier correctly did not attempt to fix them because the user had not asked for repair and the relevant browser/error-state tests were missing.

**Improvement:** maintain three explicit buckets:

1. safe deletion now;
2. needs tests before refactoring;
3. product correctness work requiring a separate approved slice.

### 5. Finish with a commit or discard decision

The candidate remains uncommitted. That is safe, but the workflow has no final disposition for the change.

**Improvement:** after the release gate, explicitly choose one of:

- commit the one-file simplification;
- discard it; or
- leave it as a named uncommitted candidate with a recorded reason.

## Recommended repeatable workflow

1. **Declare scope.** Name the skill sequence, files allowed to change, and final artefact.
2. **Read project contract.** Check `AGENTS.md`, README, scope/backlog, and relevant docs.
3. **Run baseline.** Use the project’s real test, lint, format, build, and launcher commands.
4. **Map architecture.** Trace the actual data flow and identify public contracts.
5. **Review implementation.** Separate verified defects, design concerns, and unknowns.
6. **Simplify narrowly.** Delete only proven dead code first. Add tests before changing ambiguous state or financial logic.
7. **Run affected checks.** Then run the full matrix once.
8. **Preflight browser tooling.** Do not begin UI verification without a real browser executable.
9. **Run browser QA.** Exercise the changed journey and save a dated screenshot.
10. **Run release gate.** Report PASS, FAIL, and NOT VERIFIED separately.
11. **Close the candidate.** Commit, discard, or record the uncommitted handoff explicitly.

## Final assessment

This was a good first skills workflow for an AI-built project. It produced a safe, independently checked simplification and exposed where “green tests” stopped being enough. The strongest process decision was refusing to claim browser verification without a browser.

The next improvement is operational rather than architectural: make browser-runtime preflight and final candidate disposition part of the standard workflow. For the product itself, address the stale quote state and analytical loss-limit semantics before calling the full application release-ready.
