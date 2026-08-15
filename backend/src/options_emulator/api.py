"""HTTP API boundary for fixture and read-only tastytrade market data."""

from typing import cast

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from pydantic import BaseModel, Field

from .domain import Leg, LegAction, OptionType, Position, make_price_grid
from .market_data import (
    Expiration,
    ExpirationResponse,
    GreeksResponse,
    MarketDataAdapter,
    MarketDataNotConfigured,
    OptionChainResponse,
    PricingMode,
    QuoteResponse,
    SymbolSearchResponse,
    build_adapter_from_env,
    utc_now,
)


def create_app(adapter: MarketDataAdapter | None = None) -> FastAPI:
    app = FastAPI(title="Option Emulator API", version="0.1.0")
    app.state.market_data_adapter = adapter or build_adapter_from_env()

    @app.get("/api/health")
    def health(request: Request) -> dict[str, str]:
        selected = cast(MarketDataAdapter, request.app.state.market_data_adapter)
        return {
            "status": "ok",
            "mode": selected.source.value,
            "broker_access": "read_only",
        }

    @app.get("/api/symbols/search", response_model=SymbolSearchResponse)
    async def search_symbols(
        query: str = Query(min_length=1, max_length=32),
        selected: MarketDataAdapter = Depends(_adapter_from_request),  # noqa: B008
    ) -> SymbolSearchResponse:
        try:
            return await selected.search_symbols(query.strip().upper())
        except MarketDataNotConfigured as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.get("/api/chains/{symbol}", response_model=OptionChainResponse)
    async def option_chain(
        symbol: str,
        selected: MarketDataAdapter = Depends(_adapter_from_request),  # noqa: B008
    ) -> OptionChainResponse:
        try:
            return await selected.get_chain(symbol.strip().upper())
        except MarketDataNotConfigured as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.get("/api/expirations/{symbol}", response_model=ExpirationResponse)
    async def expirations(
        symbol: str,
        selected: MarketDataAdapter = Depends(_adapter_from_request),  # noqa: B008
    ) -> ExpirationResponse:
        try:
            chain = await selected.get_chain(symbol.strip().upper())
        except MarketDataNotConfigured as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return ExpirationResponse(
            underlying_symbol=chain.underlying_symbol,
            expirations=[
                Expiration.model_validate(expiration.model_dump(exclude={"contracts"}))
                for expiration in chain.expirations
            ],
            source=chain.source,
            observed_at=chain.observed_at,
            delayed=chain.delayed,
            stale=chain.stale,
            notes=chain.notes,
        )

    @app.get("/api/quotes", response_model=QuoteResponse)
    async def quotes(
        symbols: list[str] | None = Query(default=None),  # noqa: B008
        pricing_mode: PricingMode = PricingMode.MIDPOINT,
        selected: MarketDataAdapter = Depends(_adapter_from_request),  # noqa: B008
    ) -> QuoteResponse:
        requested = [symbol.strip() for symbol in (symbols or []) if symbol.strip()]
        if not requested:
            raise HTTPException(status_code=400, detail="At least one symbol is required")
        try:
            return await selected.get_quotes(requested, pricing_mode)
        except MarketDataNotConfigured as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.get("/api/greeks", response_model=GreeksResponse)
    async def greeks(
        symbols: list[str] | None = Query(default=None),  # noqa: B008
        selected: MarketDataAdapter = Depends(_adapter_from_request),  # noqa: B008
    ) -> GreeksResponse:
        requested = [symbol.strip() for symbol in (symbols or []) if symbol.strip()]
        if not requested:
            raise HTTPException(status_code=400, detail="At least one symbol is required")
        try:
            return await selected.get_greeks(requested)
        except MarketDataNotConfigured as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/api/payoff")
    def payoff(request: PayoffRequest) -> dict[str, object]:
        leg = Leg(
            action=LegAction.BUY,
            quantity=1,
            entry_price=request.entry_price,
            option_type=request.option_type,
            strike=request.strike,
            expiry=utc_now().date(),
            symbol=request.symbol,
        )
        position = Position(symbol=request.symbol, legs=(leg,), as_of=utc_now().date())
        prices = make_price_grid(request.spot, request.range_percent)
        return {
            "symbol": request.symbol,
            "net_debit": round(position.net_debit, 2),
            "net_credit": round(position.net_credit, 2),
            "profile": [
                {"underlying_price": price, "pnl": round(pnl, 2)}
                for price, pnl in position.expiration_profile(prices)
            ],
            "source": "fixture",
            "observed_at": utc_now().isoformat(),
            "model": "expiration_intrinsic_value",
        }

    return app


class PayoffRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=10)
    option_type: OptionType
    strike: float = Field(gt=0)
    entry_price: float = Field(ge=0)
    spot: float = Field(gt=0)
    range_percent: float = Field(default=0.14, gt=0, lt=1)


def _adapter_from_request(request: Request) -> MarketDataAdapter:
    return cast(MarketDataAdapter, request.app.state.market_data_adapter)


app = create_app()
