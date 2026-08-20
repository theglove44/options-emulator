#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_PYTHON="$BACKEND_DIR/.venv/bin/python"
BACKEND_PID=""
FRONTEND_PID=""

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
(
  cd "$BACKEND_DIR"
  PYTHONPATH=src MARKET_DATA_MODE=fixture "$BACKEND_PYTHON" -m uvicorn \
    options_emulator.api:app --host 127.0.0.1 --port 8765
) &
BACKEND_PID=$!

npm --prefix "$FRONTEND_DIR" run dev -- --host 127.0.0.1 --configLoader runner &
FRONTEND_PID=$!

for _ in {1..50}; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null || ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "A local server stopped before Option Emulator became ready." >&2
    exit 1
  fi
  if curl --silent --fail http://127.0.0.1:8765/api/health >/dev/null \
    && curl --silent --fail http://127.0.0.1:5173/ >/dev/null; then
    echo "Option Emulator is ready at http://127.0.0.1:5173"
    if [[ "${OPTION_EMULATOR_OPEN_BROWSER:-1}" != "0" ]] && command -v open >/dev/null 2>&1; then
      open http://127.0.0.1:5173
    fi
    wait
    exit 0
  fi
  sleep 0.2
done

echo "Option Emulator did not become ready. Check the output above." >&2
exit 1
