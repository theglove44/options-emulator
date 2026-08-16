import unittest
from datetime import date

from options_emulator.domain import (
    InstrumentType,
    Leg,
    LegAction,
    OptionType,
    Position,
    make_price_grid,
)


class DomainTests(unittest.TestCase):
    def test_long_call_has_limited_loss_and_expiration_profit(self) -> None:
        leg = Leg(
            action=LegAction.BUY,
            quantity=1,
            entry_price=0.90,
            option_type=OptionType.CALL,
            strike=14.0,
            expiry=date(2026, 9, 18),
        )
        position = Position(symbol="ETHA", legs=(leg,))

        self.assertEqual(position.net_debit, 90.0)
        self.assertAlmostEqual(position.expiration_pnl(14.0), -90.0)
        self.assertAlmostEqual(position.expiration_pnl(16.0), 110.0)

    def test_short_put_receives_credit_and_loses_below_strike(self) -> None:
        leg = Leg(
            action=LegAction.SELL,
            quantity=1,
            entry_price=1.25,
            option_type=OptionType.PUT,
            strike=100.0,
            expiry=date(2026, 9, 18),
        )
        position = Position(symbol="TEST", legs=(leg,))

        self.assertEqual(position.net_credit, 125.0)
        self.assertEqual(position.expiration_pnl(100.0), 125.0)
        self.assertEqual(position.expiration_pnl(98.0), -75.0)

    def test_underlying_uses_one_share_multiplier(self) -> None:
        leg = Leg(
            action=LegAction.BUY,
            quantity=100,
            entry_price=10.0,
            instrument=InstrumentType.UNDERLYING,
            multiplier=1,
        )
        position = Position(symbol="TEST", legs=(leg,))

        self.assertEqual(position.net_debit, 1000.0)
        self.assertEqual(position.expiration_pnl(12.0), 200.0)

    def test_price_grid_is_symmetric_around_spot(self) -> None:
        prices = make_price_grid(100.0, range_percent=0.10, points=5)

        self.assertEqual(prices, [90.0, 95.0, 100.0, 105.0, 110.0])

    def test_canonical_multi_leg_strategy_payoffs(self) -> None:
        expiry = date(2026, 9, 18)
        vertical = Position(
            symbol="TEST",
            legs=(
                Leg(LegAction.BUY, 1, 0.90, option_type=OptionType.CALL, strike=14, expiry=expiry),
                Leg(LegAction.SELL, 1, 0.40, option_type=OptionType.CALL, strike=15, expiry=expiry),
            ),
        )
        straddle = Position(
            symbol="TEST",
            legs=(
                Leg(LegAction.BUY, 1, 0.90, option_type=OptionType.CALL, strike=14, expiry=expiry),
                Leg(LegAction.BUY, 1, 0.80, option_type=OptionType.PUT, strike=14, expiry=expiry),
            ),
        )
        strangle = Position(
            symbol="TEST",
            legs=(
                Leg(LegAction.BUY, 1, 0.40, option_type=OptionType.PUT, strike=13, expiry=expiry),
                Leg(LegAction.BUY, 1, 0.50, option_type=OptionType.CALL, strike=15, expiry=expiry),
            ),
        )
        iron_condor = Position(
            symbol="TEST",
            legs=(
                Leg(LegAction.BUY, 1, 0.10, option_type=OptionType.PUT, strike=12, expiry=expiry),
                Leg(LegAction.SELL, 1, 0.40, option_type=OptionType.PUT, strike=13, expiry=expiry),
                Leg(LegAction.SELL, 1, 0.40, option_type=OptionType.CALL, strike=15, expiry=expiry),
                Leg(LegAction.BUY, 1, 0.10, option_type=OptionType.CALL, strike=16, expiry=expiry),
            ),
        )

        self.assertEqual(vertical.net_debit, 50.0)
        self.assertAlmostEqual(vertical.expiration_pnl(16), 50.0)
        self.assertAlmostEqual(straddle.expiration_pnl(14), -170.0)
        self.assertAlmostEqual(strangle.expiration_pnl(12), 10.0)
        self.assertEqual(iron_condor.net_credit, 60.0)
        self.assertAlmostEqual(iron_condor.expiration_pnl(14), 60.0)


if __name__ == "__main__":
    unittest.main()
