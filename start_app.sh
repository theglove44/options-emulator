#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_PYTHON="$BACKEND_DIR/.venv/bin/python"
BACKEND_PID=""
FRONTEND_PID=""

BACKEND_PORT="$(python3 "$PROJECT_ROOT/scripts/choose_port.py" "${OPTION_EMULATOR_BACKEND_PORT:-8765}")"
FRONTEND_PORT="$(python3 "$PROJECT_ROOT/scripts/choose_port.py" "${OPTION_EMULATOR_FRONTEND_PORT:-5173}")"
FRONTEND_URL="http://127.0.0.1:$FRONTEND_PORT"

cleanup() {
  trap - INT TERM EXIT
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}

trap cleanup INT TERM EXIT

if [[ ! -x "$BACKEND_PYTHON" ]]; then
  echo "Preparing the local backend environment..."
  python3 -m venv "$BACKEND_DIR/.venv"
  "$BACKEND_PYTHON" -m pip install -e "${BACKEND_DIR}[dev]"
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Preparing the local frontend environment..."
  npm --prefix "$FRONTEND_DIR" ci
fi

echo "Starting Option Emulator in fixture mode..."
if [[ "$BACKEND_PORT" != "${OPTION_EMULATOR_BACKEND_PORT:-8765}" ]]; then
  echo "Backend port ${OPTION_EMULATOR_BACKEND_PORT:-8765} is busy; using $BACKEND_PORT."
fi
if [[ "$FRONTEND_PORT" != "${OPTION_EMULATOR_FRONTEND_PORT:-5173}" ]]; then
  echo "Frontend port ${OPTION_EMULATOR_FRONTEND_PORT:-5173} is busy; using $FRONTEND_PORT."
fi
(
  cd "$BACKEND_DIR"
  PYTHONPATH=src MARKET_DATA_MODE=fixture "$BACKEND_PYTHON" -m uvicorn \
    options_emulator.api:app --host 127.0.0.1 --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

VITE_BACKEND_PORT="$BACKEND_PORT" npm --prefix "$FRONTEND_DIR" run dev -- \
  --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort --configLoader runner &
FRONTEND_PID=$!

for _ in {1..50}; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null || ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "A local server stopped before Option Emulator became ready." >&2
    exit 1
  fi
  if curl --silent --fail "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null \
    && curl --silent --fail "$FRONTEND_URL/" >/dev/null; then
    echo "Option Emulator is ready at $FRONTEND_URL"
    if [[ "${OPTION_EMULATOR_OPEN_BROWSER:-1}" != "0" ]] && command -v open >/dev/null 2>&1; then
      open "$FRONTEND_URL"
    fi
    wait
    exit 0
  fi
  sleep 0.2
done

echo "Option Emulator did not become ready. Check the output above." >&2
exit 1
