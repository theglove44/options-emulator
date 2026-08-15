"""Small, explicit domain model for expiration payoff calculations.

The domain module intentionally has no broker or web dependencies. This keeps the
financial arithmetic testable with deterministic fixtures before live data is wired.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum


class OptionType(StrEnum):
    CALL = "call"
    PUT = "put"


class LegAction(StrEnum):
    BUY = "buy"
    SELL = "sell"

    @property
    def sign(self) -> int:
        return 1 if self is LegAction.BUY else -1


class InstrumentType(StrEnum):
    OPTION = "option"
    UNDERLYING = "underlying"


@dataclass(frozen=True)
class Leg:
    """One explicit position leg.

    Option entry prices are quoted per share and are multiplied by 100 by default.
    Underlying legs use a multiplier of one. Entry price is always positive; side
    determines whether the cash flow is a debit or credit.
    """

    action: LegAction
    quantity: int
    entry_price: float
    instrument: InstrumentType = InstrumentType.OPTION
    option_type: OptionType | None = None
    strike: float | None = None
    expiry: date | None = None
    multiplier: int = 100
    symbol: str | None = None

    def __post_init__(self) -> None:
        if self.quantity <= 0:
            raise ValueError("quantity must be positive")
        if self.entry_price < 0:
            raise ValueError("entry_price cannot be negative")
        if self.instrument is InstrumentType.OPTION:
            if self.option_type is None or self.strike is None or self.expiry is None:
                raise ValueError("option legs require option_type, strike, and expiry")
            if self.multiplier <= 0:
                raise ValueError("option multiplier must be positive")
        elif self.multiplier != 1:
            raise ValueError("underlying legs must use multiplier 1")

    @property
    def signed_quantity(self) -> int:
        return self.action.sign * self.quantity

    def value_at_expiration(self, underlying_price: float) -> float:
        if underlying_price < 0:
            raise ValueError("underlying_price cannot be negative")
        if self.instrument is InstrumentType.UNDERLYING:
            return underlying_price
        assert self.option_type is not None
        assert self.strike is not None
        if self.option_type is OptionType.CALL:
            return max(underlying_price - self.strike, 0.0)
        return max(self.strike - underlying_price, 0.0)

    def expiration_pnl(self, underlying_price: float) -> float:
        value_change = self.value_at_expiration(underlying_price) - self.entry_price
        return self.signed_quantity * self.multiplier * value_change


@dataclass(frozen=True)
class Position:
    symbol: str
    legs: tuple[Leg, ...] = field(default_factory=tuple)
    as_of: date | None = None

    def __post_init__(self) -> None:
        if not self.symbol.strip():
            raise ValueError("symbol cannot be blank")
        if not self.legs:
            raise ValueError("position must contain at least one leg")

    @property
    def net_cash_flow(self) -> float:
        """Cash flow to enter: positive is a debit, negative is a credit."""

        return sum(leg.signed_quantity * leg.multiplier * leg.entry_price for leg in self.legs)

    @property
    def net_debit(self) -> float:
        return max(self.net_cash_flow, 0.0)

    @property
    def net_credit(self) -> float:
        return max(-self.net_cash_flow, 0.0)

    def expiration_pnl(self, underlying_price: float) -> float:
        return sum(leg.expiration_pnl(underlying_price) for leg in self.legs)

    def expiration_profile(self, prices: list[float]) -> list[tuple[float, float]]:
        return [(price, self.expiration_pnl(price)) for price in prices]


def make_price_grid(spot: float, range_percent: float = 0.14, points: int = 41) -> list[float]:
    if spot <= 0:
        raise ValueError("spot must be positive")
    if not 0 < range_percent < 1:
        raise ValueError("range_percent must be between 0 and 1")
    if points < 2:
        raise ValueError("points must be at least 2")
    low = spot * (1 - range_percent)
    high = spot * (1 + range_percent)
    step = (high - low) / (points - 1)
    return [round(low + index * step, 6) for index in range(points)]
