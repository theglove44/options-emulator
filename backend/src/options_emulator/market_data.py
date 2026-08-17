"""Read-only market-data contracts and tastytrade/fixture adapters.

The browser receives these normalised models rather than broker SDK objects.
The tastytrade implementation deliberately imports the SDK lazily so fixture
mode remains usable when credentials or the optional runtime are unavailable.
"""

from __future__ import annotations

import asyncio
import math
import os
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum
from typing import Any, Protocol

from pydantic import BaseModel, Field


class DataSource(StrEnum):
    FIXTURE = "fixture"
    TASTYTRADE = "tastytrade"


class PricingMode(StrEnum):
    MIDPOINT = "midpoint"
    BID = "bid"
    ASK = "ask"
    LAST = "last"


class DataContext(BaseModel):
    source: DataSource
    observed_at: datetime
    delayed: bool = False
    stale: bool = False
    pricing_mode: PricingMode | None = None
    notes: list[str] = Field(default_factory=list)


class SymbolResult(BaseModel):
    symbol: str
    description: str


class SymbolSearchResponse(DataContext):
    query: str
    items: list[SymbolResult]


class Expiration(BaseModel):
    expiration_date: date
    days_to_expiration: int
    expiration_type: str
    settlement_type: str


class OptionContract(BaseModel):
    symbol: str
    streamer_symbol: str | None = None
    expiration_date: date
    days_to_expiration: int
    strike: float
    option_type: str
    shares_per_contract: int
    active: bool = True


class ChainExpiration(Expiration):
    contracts: list[OptionContract]


class OptionChainResponse(DataContext):
    underlying_symbol: str
    expirations: list[ChainExpiration]


class ExpirationResponse(DataContext):
    underlying_symbol: str
    expirations: list[Expiration]


class GreekSnapshot(BaseModel):
    implied_volatility: float | None = None
    delta: float | None = None
    gamma: float | None = None
    theta: float | None = None
    rho: float | None = None
    vega: float | None = None


class QuoteSnapshot(BaseModel):
    symbol: str
    streamer_symbol: str | None = None
    instrument_type: str
    underlying_symbol: str | None = None
    expiration_date: date | None = None
    strike: float | None = None
    option_type: str | None = None
    bid: float | None = None
    ask: float | None = None
    midpoint: float | None = None
    last: float | None = None
    mark: float | None = None
    selected_price: float | None = None
    volume: float | None = None
    open_interest: float | None = None
    greeks: GreekSnapshot | None = None
    observed_at: datetime
    delayed: bool = False
    stale: bool = False


class QuoteResponse(DataContext):
    items: list[QuoteSnapshot]


class GreeksResponse(DataContext):
    items: list[QuoteSnapshot]


class MarketDataNotConfigured(RuntimeError):
    """Raised when live mode was selected without backend credentials."""


class MarketDataAdapter(Protocol):
    source: DataSource
    delayed: bool

    async def search_symbols(self, query: str) -> SymbolSearchResponse: ...

    async def get_chain(self, symbol: str) -> OptionChainResponse: ...

    async def get_quotes(
        self, symbols: Sequence[str], pricing_mode: PricingMode
    ) -> QuoteResponse: ...

    async def get_greeks(self, symbols: Sequence[str]) -> GreeksResponse: ...


def utc_now() -> datetime:
    return datetime.now(UTC)


def _context(
    source: DataSource,
    *,
    observed_at: datetime | None = None,
    delayed: bool = False,
    pricing_mode: PricingMode | None = None,
    notes: list[str] | None = None,
) -> DataContext:
    observed = observed_at or utc_now()
    return DataContext(
        source=source,
        observed_at=observed,
        delayed=delayed,
        stale=utc_now() - observed > timedelta(minutes=5),
        pricing_mode=pricing_mode,
        notes=notes or [],
    )


def _select_price(
    bid: float | None,
    ask: float | None,
    last: float | None,
    pricing_mode: PricingMode,
) -> float | None:
    if pricing_mode is PricingMode.BID:
        return bid
    if pricing_mode is PricingMode.ASK:
        return ask
    if pricing_mode is PricingMode.LAST:
        return last
    if bid is not None and ask is not None:
        return (bid + ask) / 2
    return last


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(result) else result


def _as_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        result = value
    elif isinstance(value, date):
        result = datetime.combine(value, datetime.min.time())
    elif isinstance(value, str):
        result = datetime.fromisoformat(value)
    else:
        return utc_now()
    return result.replace(tzinfo=UTC) if result.tzinfo is None else result


_OCC_OPTION_RE = re.compile(
    r"^(?P<root>[A-Z0-9./]+)(?P<expiry>\d{6})(?P<type>[CP])(?P<strike>\d{8})$"
)


def _parse_option_symbol(symbol: str) -> dict[str, Any] | None:
    compact = symbol.replace(" ", "").upper()
    match = _OCC_OPTION_RE.fullmatch(compact)
    if not match:
        return None
    try:
        expiry_text = match.group("expiry")
        expiry = date(
            2000 + int(expiry_text[:2]),
            int(expiry_text[2:4]),
            int(expiry_text[4:]),
        )
    except ValueError:
        return None
    return {
        "underlying_symbol": match.group("root"),
        "expiration_date": expiry,
        "strike": int(match.group("strike")) / 1000,
        "option_type": "call" if match.group("type") == "C" else "put",
    }


def _stale(observed_at: datetime) -> bool:
    return utc_now() - observed_at > timedelta(minutes=5)


def _event_datetime(value: Any) -> datetime:
    milliseconds = _as_float(value)
    if milliseconds is None or milliseconds <= 0:
        return utc_now()
    return datetime.fromtimestamp(milliseconds / 1000, tz=UTC)


def _quote_snapshot_from_market_data(
    item: Any,
    *,
    pricing_mode: PricingMode,
    greeks: GreekSnapshot | None = None,
    delayed: bool = False,
    streamer_symbol: str | None = None,
) -> QuoteSnapshot:
    symbol = str(item.symbol)
    metadata = _parse_option_symbol(symbol)
    observed_at = _as_datetime(getattr(item, "updated_at", None))
    bid = _as_float(getattr(item, "bid", None))
    ask = _as_float(getattr(item, "ask", None))
    midpoint = _as_float(getattr(item, "mid", None))
    if midpoint is None and bid is not None and ask is not None:
        midpoint = (bid + ask) / 2
    return QuoteSnapshot(
        symbol=symbol,
        streamer_symbol=streamer_symbol,
        instrument_type=("equity_option" if metadata is not None else "equity"),
        underlying_symbol=metadata["underlying_symbol"] if metadata else symbol,
        expiration_date=metadata["expiration_date"] if metadata else None,
        strike=metadata["strike"] if metadata else None,
        option_type=metadata["option_type"] if metadata else None,
        bid=bid,
        ask=ask,
        midpoint=midpoint,
        last=_as_float(getattr(item, "last", None)),
        mark=_as_float(getattr(item, "mark", None)),
        selected_price=_select_price(
            bid,
            ask,
            _as_float(getattr(item, "last", None)),
            pricing_mode,
        ),
        volume=_as_float(getattr(item, "volume", None)),
        open_interest=_as_float(getattr(item, "open_interest", None)),
        greeks=greeks,
        observed_at=observed_at,
        delayed=delayed,
        stale=_stale(observed_at),
    )


FIXTURE_EXPIRATIONS = (
    (date(2026, 8, 21), 6),
    (date(2026, 8, 28), 13),
    (date(2026, 9, 18), 34),
    (date(2026, 10, 16), 62),
    (date(2026, 12, 18), 125),
    (date(2027, 1, 15), 153),
)
FIXTURE_STRIKES = (12.0, 13.0, 14.0, 15.0, 16.0, 17.0)
FIXTURE_SPOT = 14.18


@dataclass(frozen=True)
class FixtureProfile:
    spot: float
    strikes: tuple[float, ...]


FIXTURE_PROFILES = {
    "ETHA": FixtureProfile(FIXTURE_SPOT, FIXTURE_STRIKES),
    "AAPL": FixtureProfile(225.40, (215.0, 220.0, 225.0, 230.0, 235.0, 240.0)),
    "SPY": FixtureProfile(600.25, (590.0, 595.0, 600.0, 605.0, 610.0, 615.0)),
    "IWM": FixtureProfile(215.75, (205.0, 210.0, 215.0, 220.0, 225.0, 230.0)),
}


def _fixture_profile(underlying: str) -> FixtureProfile:
    normalized = underlying.strip().upper()
    profile = FIXTURE_PROFILES.get(normalized)
    if profile is not None:
        return profile

    # Unknown symbols remain usable in fixture mode without pretending they
    # are observed broker data. The profile is stable for a given symbol so a
    # symbol edit visibly changes the chain and quote context.
    seed = sum((index + 1) * ord(character) for index, character in enumerate(normalized))
    step = 1.0 if seed % 3 == 0 else 5.0
    spot = float((seed % 480) + 20)
    centre = round(spot / step) * step
    strikes = tuple(round(centre + step * offset, 2) for offset in (-2, -1, 0, 1, 2, 3))
    return FixtureProfile(round(spot, 2), strikes)


def _fixture_option_symbol(
    underlying: str, expiry: date, option_type: str, strike: float
) -> tuple[str, str]:
    type_code = "C" if option_type == "call" else "P"
    root = underlying.upper()
    occ = f"{root:<6}{expiry:%y%m%d}{type_code}{round(strike * 1000):08d}"
    streamer = f".{root}{expiry:%y%m%d}{type_code}{strike:g}"
    return occ, streamer


class FixtureMarketDataAdapter:
    """Deterministic market-data adapter used without broker access."""

    source = DataSource.FIXTURE
    delayed = False

    async def search_symbols(self, query: str) -> SymbolSearchResponse:
        symbols = {
            "ETHA": "iShares Ethereum Trust ETF",
            "SPY": "SPDR S&P 500 ETF Trust",
            "AAPL": "Apple Inc.",
            "IWM": "iShares Russell 2000 ETF",
        }
        normalized = query.strip().upper()
        items = [
            SymbolResult(symbol=symbol, description=description)
            for symbol, description in symbols.items()
            if normalized in symbol or normalized in description.upper()
        ]
        context = _context(
            self.source,
            notes=["Deterministic fixture; no broker request was made."],
        )
        return SymbolSearchResponse(query=query, items=items, **context.model_dump())

    async def get_chain(self, symbol: str) -> OptionChainResponse:
        underlying = symbol.strip().upper()
        profile = _fixture_profile(underlying)
        expirations: list[ChainExpiration] = []
        for expiry, days in FIXTURE_EXPIRATIONS:
            contracts: list[OptionContract] = []
            for strike in profile.strikes:
                for option_type in ("call", "put"):
                    occ, streamer = _fixture_option_symbol(underlying, expiry, option_type, strike)
                    contracts.append(
                        OptionContract(
                            symbol=occ,
                            streamer_symbol=streamer,
                            expiration_date=expiry,
                            days_to_expiration=days,
                            strike=strike,
                            option_type=option_type,
                            shares_per_contract=100,
                        )
                    )
            expirations.append(
                ChainExpiration(
                    expiration_date=expiry,
                    days_to_expiration=days,
                    expiration_type="Regular",
                    settlement_type="PM",
                    contracts=contracts,
                )
            )
        context = _context(
            self.source,
            notes=["Deterministic fixture chain; prices are not observed market data."],
        )
        return OptionChainResponse(
            underlying_symbol=underlying,
            expirations=expirations,
            **context.model_dump(),
        )

    async def get_quotes(self, symbols: Sequence[str], pricing_mode: PricingMode) -> QuoteResponse:
        now = utc_now()
        items: list[QuoteSnapshot] = []
        for requested_symbol in dict.fromkeys(symbols):
            symbol = requested_symbol.strip().upper()
            metadata = _parse_option_symbol(symbol)
            if metadata:
                profile = _fixture_profile(metadata["underlying_symbol"])
                intrinsic = (
                    max(profile.spot - metadata["strike"], 0)
                    if metadata["option_type"] == "call"
                    else max(metadata["strike"] - profile.spot, 0)
                )
                premium = intrinsic + (0.90 if metadata["option_type"] == "call" else 0.80)
                bid, ask, last = (
                    round(max(premium - 0.05, 0), 2),
                    round(premium + 0.05, 2),
                    round(premium, 2),
                )
                _, streamer = _fixture_option_symbol(
                    metadata["underlying_symbol"],
                    metadata["expiration_date"],
                    metadata["option_type"],
                    metadata["strike"],
                )
                item = QuoteSnapshot(
                    symbol=symbol,
                    streamer_symbol=streamer,
                    instrument_type="equity_option",
                    underlying_symbol=metadata["underlying_symbol"],
                    expiration_date=metadata["expiration_date"],
                    strike=metadata["strike"],
                    option_type=metadata["option_type"],
                    bid=bid,
                    ask=ask,
                    midpoint=(bid + ask) / 2,
                    last=last,
                    mark=None,
                    selected_price=_select_price(bid, ask, last, pricing_mode),
                    volume=1250,
                    open_interest=4820,
                    greeks=GreekSnapshot(
                        implied_volatility=0.45,
                        delta=0.56 if metadata["option_type"] == "call" else -0.44,
                        gamma=0.12,
                        theta=-0.04,
                        rho=0.02 if metadata["option_type"] == "call" else -0.02,
                        vega=0.08,
                    ),
                    observed_at=now,
                )
            else:
                profile = _fixture_profile(symbol)
                bid = round(profile.spot - 0.05, 2)
                ask = round(profile.spot + 0.05, 2)
                last = profile.spot
                item = QuoteSnapshot(
                    symbol=symbol,
                    streamer_symbol=symbol,
                    instrument_type="equity",
                    underlying_symbol=symbol,
                    bid=bid,
                    ask=ask,
                    midpoint=(bid + ask) / 2,
                    last=last,
                    selected_price=_select_price(bid, ask, last, pricing_mode),
                    volume=1_250_000,
                    observed_at=now,
                )
            items.append(item)
        context = _context(
            self.source,
            observed_at=now,
            pricing_mode=pricing_mode,
            notes=["Deterministic fixture; no broker request was made."],
        )
        return QuoteResponse(items=items, **context.model_dump())

    async def get_greeks(self, symbols: Sequence[str]) -> GreeksResponse:
        quote_response = await self.get_quotes(symbols, PricingMode.MIDPOINT)
        items = [item for item in quote_response.items if item.greeks is not None]
        return GreeksResponse(
            items=items,
            **quote_response.model_dump(exclude={"items", "pricing_mode"}),
        )


class TastytradeMarketDataAdapter:
    """Read-only adapter over the tastytrade Python SDK."""

    source = DataSource.TASTYTRADE

    def __init__(
        self,
        client_secret: str | None,
        refresh_token: str | None,
        *,
        is_test: bool = False,
        streamer_timeout: float = 5.0,
    ) -> None:
        self.client_secret = client_secret
        self.refresh_token = refresh_token
        self.is_test = is_test
        self.streamer_timeout = streamer_timeout

    @property
    def delayed(self) -> bool:
        # Tastytrade documents sandbox quotes as delayed. Production delay/stale
        # state is retained from the observed timestamp instead.
        return self.is_test

    def _require_credentials(self) -> None:
        if not self.client_secret or not self.refresh_token:
            raise MarketDataNotConfigured(
                "Live tastytrade mode requires TASTY_CLIENT_SECRET and "
                "TASTY_REFRESH_TOKEN in the backend environment."
            )

    def _session(self) -> Any:
        try:
            from tastytrade import Session
        except ImportError as exc:
            raise MarketDataNotConfigured(
                "Live tastytrade mode requires the backend tastytrade dependency."
            ) from exc
        return Session(self.client_secret, self.refresh_token, is_test=self.is_test)

    async def search_symbols(self, query: str) -> SymbolSearchResponse:
        self._require_credentials()
        from tastytrade.search import symbol_search

        async with self._session() as session:
            results = await symbol_search(session, query)
        items = [
            SymbolResult(symbol=result.symbol, description=result.description) for result in results
        ]
        context = _context(self.source, delayed=self.delayed)
        return SymbolSearchResponse(query=query, items=items, **context.model_dump())

    async def get_chain(self, symbol: str) -> OptionChainResponse:
        self._require_credentials()
        from tastytrade.instruments import get_option_chain

        async with self._session() as session:
            chain = await get_option_chain(session, symbol)

        expirations: list[ChainExpiration] = []
        for expiry_date, options in sorted(chain.items(), key=lambda item: item[0]):
            if not options:
                continue
            first = options[0]
            contracts = [
                OptionContract(
                    symbol=option.symbol,
                    streamer_symbol=option.streamer_symbol,
                    expiration_date=option.expiration_date,
                    days_to_expiration=option.days_to_expiration,
                    strike=_as_float(option.strike_price) or 0.0,
                    option_type=("call" if option.option_type.value == "C" else "put"),
                    shares_per_contract=option.shares_per_contract,
                    active=option.active,
                )
                for option in sorted(
                    options, key=lambda item: (item.strike_price, item.option_type.value)
                )
            ]
            expirations.append(
                ChainExpiration(
                    expiration_date=expiry_date,
                    days_to_expiration=first.days_to_expiration,
                    expiration_type=first.expiration_type,
                    settlement_type=first.settlement_type,
                    contracts=contracts,
                )
            )
        context = _context(self.source, delayed=self.delayed)
        return OptionChainResponse(
            underlying_symbol=symbol.upper(),
            expirations=expirations,
            **context.model_dump(),
        )

    async def get_quotes(self, symbols: Sequence[str], pricing_mode: PricingMode) -> QuoteResponse:
        self._require_credentials()
        from tastytrade import DXLinkStreamer
        from tastytrade.dxfeed import Greeks
        from tastytrade.instruments import Option
        from tastytrade.market_data import get_market_data_by_type

        requested = list(dict.fromkeys(symbol.strip() for symbol in symbols if symbol.strip()))
        option_symbols = [symbol for symbol in requested if _parse_option_symbol(symbol)]
        equity_symbols = [symbol for symbol in requested if symbol not in option_symbols]
        kwargs: dict[str, list[str]] = {}
        if equity_symbols:
            kwargs["equities"] = equity_symbols
        if option_symbols:
            kwargs["options"] = option_symbols

        async with self._session() as session:
            market_data = await get_market_data_by_type(session, **kwargs)
            greek_events = await self._fetch_greeks(
                session, option_symbols, DXLinkStreamer, Greeks, Option
            )

        items: list[QuoteSnapshot] = []
        for item in market_data:
            symbol = str(item.symbol)
            streamer_symbol = None
            if symbol in option_symbols:
                streamer_symbol = _option_streamer_symbol(symbol, Option)
            greek = greek_events.get(streamer_symbol or "")
            items.append(
                _quote_snapshot_from_market_data(
                    item,
                    pricing_mode=pricing_mode,
                    greeks=greek[0] if greek else None,
                    delayed=self.delayed,
                    streamer_symbol=streamer_symbol,
                )
            )
        observed_at = max((item.observed_at for item in items), default=utc_now())
        context = _context(
            self.source,
            observed_at=observed_at,
            delayed=self.delayed,
            pricing_mode=pricing_mode,
        )
        return QuoteResponse(items=items, **context.model_dump())

    async def get_greeks(self, symbols: Sequence[str]) -> GreeksResponse:
        self._require_credentials()
        from tastytrade import DXLinkStreamer
        from tastytrade.dxfeed import Greeks
        from tastytrade.instruments import Option

        requested = list(dict.fromkeys(symbol.strip() for symbol in symbols if symbol.strip()))
        async with self._session() as session:
            events = await self._fetch_greeks(session, requested, DXLinkStreamer, Greeks, Option)
        items: list[QuoteSnapshot] = []
        for symbol in requested:
            metadata = _parse_option_symbol(symbol) or {}
            streamer = _option_streamer_symbol(symbol, Option)
            event = events.get(streamer)
            if event is None:
                continue
            greek, observed_at = event
            items.append(
                QuoteSnapshot(
                    symbol=symbol,
                    streamer_symbol=streamer,
                    instrument_type="equity_option",
                    underlying_symbol=metadata.get("underlying_symbol"),
                    expiration_date=metadata.get("expiration_date"),
                    strike=metadata.get("strike"),
                    option_type=metadata.get("option_type"),
                    greeks=greek,
                    observed_at=observed_at,
                    delayed=self.delayed,
                    stale=_stale(observed_at),
                )
            )
        observed_at = max((item.observed_at for item in items), default=utc_now())
        context = _context(self.source, observed_at=observed_at, delayed=self.delayed)
        return GreeksResponse(items=items, **context.model_dump())

    async def _fetch_greeks(
        self,
        session: Any,
        symbols: Sequence[str],
        streamer_class: Any,
        greeks_class: Any,
        option_class: Any,
    ) -> dict[str, tuple[GreekSnapshot, datetime]]:
        streamer_symbols = {_option_streamer_symbol(symbol, option_class) for symbol in symbols}
        if not streamer_symbols:
            return {}
        events: dict[str, tuple[GreekSnapshot, datetime]] = {}
        async with streamer_class(session) as streamer:
            await streamer.subscribe(greeks_class, list(streamer_symbols))
            deadline = asyncio.get_running_loop().time() + self.streamer_timeout
            while len(events) < len(streamer_symbols):
                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    break
                try:
                    event = await asyncio.wait_for(
                        streamer.get_event(greeks_class), timeout=remaining
                    )
                except TimeoutError:
                    break
                event_symbol = str(
                    getattr(event, "event_symbol", getattr(event, "eventSymbol", ""))
                )
                if event_symbol not in streamer_symbols:
                    continue
                events[event_symbol] = (
                    GreekSnapshot(
                        implied_volatility=_as_float(getattr(event, "volatility", None)),
                        delta=_as_float(getattr(event, "delta", None)),
                        gamma=_as_float(getattr(event, "gamma", None)),
                        theta=_as_float(getattr(event, "theta", None)),
                        rho=_as_float(getattr(event, "rho", None)),
                        vega=_as_float(getattr(event, "vega", None)),
                    ),
                    _event_datetime(getattr(event, "time", None)),
                )
        return events


def _option_streamer_symbol(symbol: str, option_class: Any) -> str:
    if symbol.startswith("."):
        return symbol
    return str(option_class.occ_to_streamer_symbol(symbol))


def build_adapter_from_env() -> MarketDataAdapter:
    mode = os.getenv("MARKET_DATA_MODE", "fixture").strip().lower()
    if mode == DataSource.FIXTURE.value:
        return FixtureMarketDataAdapter()
    if mode == DataSource.TASTYTRADE.value:
        return TastytradeMarketDataAdapter(
            os.getenv("TASTY_CLIENT_SECRET"),
            os.getenv("TASTY_REFRESH_TOKEN"),
            is_test=os.getenv("TASTYTRADE_IS_TEST", "false").lower() == "true",
        )
    raise ValueError("MARKET_DATA_MODE must be 'fixture' or 'tastytrade'")
