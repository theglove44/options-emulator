"""Authenticated, read-only tastytrade market-data smoke command.

The command deliberately uses only the existing market-data adapter methods.
It loads an optional private backend ``.env`` file without printing its values,
then emits a small sanitised JSON summary suitable for a terminal or CI log.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

from .market_data import (
    MarketDataAdapter,
    MarketDataNotConfigured,
    PricingMode,
    TastytradeMarketDataAdapter,
)


def _load_private_env(path: Path) -> None:
    """Load simple KEY=VALUE entries without replacing process variables."""

    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, value = line.partition("=")
        if not separator or not key or not key.replace("_", "").isalnum():
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


def _quote_summary(item: Any) -> dict[str, Any]:
    return {
        "symbol": item.symbol,
        "instrument_type": item.instrument_type,
        "selected_price": item.selected_price,
        "bid": item.bid,
        "ask": item.ask,
        "last": item.last,
        "observed_at": item.observed_at.isoformat(),
        "delayed": item.delayed,
        "stale": item.stale,
        "has_greeks": item.greeks is not None,
    }


async def run_smoke(
    adapter: MarketDataAdapter,
    symbol: str,
    pricing_mode: PricingMode,
) -> dict[str, Any]:
    """Exercise symbol, chain, quote, and Greek reads and return safe metadata."""

    normalized_symbol = symbol.strip().upper()
    search = await adapter.search_symbols(normalized_symbol)
    chain = await adapter.get_chain(normalized_symbol)
    contracts = [
        contract
        for expiration in chain.expirations
        for contract in expiration.contracts
        if contract.active
    ]
    if not contracts:
        raise RuntimeError("No active option contracts were returned")
    contract = next(
        (item for item in contracts if item.option_type == "call"),
        contracts[0],
    )
    quotes = await adapter.get_quotes(
        [normalized_symbol, contract.symbol],
        pricing_mode,
    )
    greeks = await adapter.get_greeks([contract.symbol])

    return {
        "status": "ok",
        "safety": {
            "broker_access": "read_only",
            "mutating_operations_performed": False,
        },
        "source": adapter.source.value,
        "sandbox": getattr(adapter, "is_test", False),
        "symbol_search": {
            "query": search.query,
            "result_count": len(search.items),
            "observed_at": search.observed_at.isoformat(),
            "delayed": search.delayed,
            "stale": search.stale,
        },
        "chain": {
            "underlying_symbol": chain.underlying_symbol,
            "expiration_count": len(chain.expirations),
            "active_contract_count": len(contracts),
            "selected_contract": contract.symbol,
            "observed_at": chain.observed_at.isoformat(),
            "delayed": chain.delayed,
            "stale": chain.stale,
        },
        "quotes": {
            "pricing_mode": pricing_mode.value,
            "observed_at": quotes.observed_at.isoformat(),
            "delayed": quotes.delayed,
            "stale": quotes.stale,
            "items": [_quote_summary(item) for item in quotes.items],
        },
        "greeks": {
            "observed_at": greeks.observed_at.isoformat(),
            "delayed": greeks.delayed,
            "stale": greeks.stale,
            "items": [
                {
                    "symbol": item.symbol,
                    "observed_at": item.observed_at.isoformat(),
                    "delayed": item.delayed,
                    "stale": item.stale,
                    "delta": item.greeks.delta if item.greeks else None,
                    "implied_volatility": (item.greeks.implied_volatility if item.greeks else None),
                }
                for item in greeks.items
            ],
        },
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run an authenticated, read-only tastytrade market-data smoke."
    )
    parser.add_argument("--symbol", default="SPY", help="Underlying symbol to read (default: SPY)")
    parser.add_argument(
        "--pricing-mode",
        choices=[mode.value for mode in PricingMode],
        default=PricingMode.MIDPOINT.value,
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=Path(".env"),
        help="Private backend env file to load if present (default: .env)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    _load_private_env(args.env_file)
    client_secret = os.getenv("TASTY_CLIENT_SECRET")
    refresh_token = os.getenv("TASTY_REFRESH_TOKEN")
    if not client_secret or not refresh_token:
        print(
            json.dumps(
                {
                    "status": "blocked",
                    "reason": "TASTY_CLIENT_SECRET and TASTY_REFRESH_TOKEN are not configured",
                }
            ),
            file=sys.stderr,
        )
        return 2

    adapter = TastytradeMarketDataAdapter(
        client_secret,
        refresh_token,
        is_test=os.getenv("TASTYTRADE_IS_TEST", "false").lower() == "true",
    )
    try:
        result = asyncio.run(run_smoke(adapter, args.symbol, PricingMode(args.pricing_mode)))
    except MarketDataNotConfigured:
        print(
            json.dumps(
                {
                    "status": "blocked",
                    "reason": "The read-only tastytrade adapter is not configured",
                }
            ),
            file=sys.stderr,
        )
        return 2
    except Exception as exc:  # noqa: BLE001 - do not leak SDK/network details to logs.
        print(
            json.dumps(
                {
                    "status": "failed",
                    "error_type": type(exc).__name__,
                    "reason": "The read-only market-data smoke failed",
                }
            ),
            file=sys.stderr,
        )
        return 1

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
