import asyncio
import unittest
from datetime import date

from options_emulator.market_data import (
    FixtureMarketDataAdapter,
    MarketDataNotConfigured,
    PricingMode,
    TastytradeMarketDataAdapter,
    _select_price,
)


class MarketDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.adapter = FixtureMarketDataAdapter()

    def test_fixture_chain_has_expirations_and_both_option_types(self) -> None:
        chain = asyncio.run(self.adapter.get_chain("ETHA"))

        self.assertEqual(chain.source, "fixture")
        self.assertEqual(chain.underlying_symbol, "ETHA")
        self.assertEqual(len(chain.expirations), 6)
        september_expiry = date(2026, 9, 18)
        self.assertEqual(
            chain.expirations[2].days_to_expiration,
            max((september_expiry - chain.observed_at.date()).days, 0),
        )
        self.assertEqual(
            {contract.option_type for contract in chain.expirations[0].contracts},
            {"call", "put"},
        )
        strike_sets = [
            {contract.strike for contract in expiration.contracts}
            for expiration in chain.expirations
        ]
        self.assertEqual(len({tuple(sorted(strikes)) for strikes in strike_sets}), 6)
        self.assertTrue(set.intersection(*strike_sets))

    def test_fixture_quote_honours_selected_pricing_mode(self) -> None:
        quotes = asyncio.run(self.adapter.get_quotes(["ETHA"], PricingMode.ASK))

        self.assertEqual(quotes.items[0].selected_price, 14.23)
        self.assertEqual(quotes.pricing_mode, PricingMode.ASK)
        self.assertEqual(quotes.items[0].observed_at.tzinfo.utcoffset(None).total_seconds(), 0)

    def test_fixture_symbol_changes_have_distinct_chain_and_underlying_context(self) -> None:
        etha_chain = asyncio.run(self.adapter.get_chain("ETHA"))
        aapl_chain = asyncio.run(self.adapter.get_chain("AAPL"))
        aapl_quotes = asyncio.run(self.adapter.get_quotes(["AAPL"], PricingMode.MIDPOINT))
        aapl_quote = aapl_quotes.items[0]

        self.assertNotEqual(
            etha_chain.expirations[0].contracts[0].strike,
            aapl_chain.expirations[0].contracts[0].strike,
        )
        self.assertAlmostEqual(aapl_quote.selected_price, 303.6)
        self.assertAlmostEqual(aapl_quotes.spot_price, 303.6)
        self.assertIn(
            300.0,
            [contract.strike for contract in aapl_chain.expirations[0].contracts],
        )

    def test_fixture_option_quote_contains_greeks_and_contract_metadata(self) -> None:
        symbol = "ETHA  260918C00014000"
        quotes = asyncio.run(self.adapter.get_quotes([symbol], PricingMode.MIDPOINT))
        quote = quotes.items[0]

        self.assertEqual(quote.instrument_type, "equity_option")
        self.assertEqual(quote.expiration_date, date(2026, 9, 18))
        self.assertEqual(quote.strike, 14.0)
        self.assertIsNotNone(quote.greeks)
        self.assertGreater(quote.greeks.delta, 0)

    def test_fixture_option_delta_changes_with_strike(self) -> None:
        symbols = [
            "AAPL  260918C00290000",
            "AAPL  260918C00315000",
            "AAPL  260918P00315000",
        ]
        quotes = asyncio.run(self.adapter.get_quotes(symbols, PricingMode.MIDPOINT))
        deltas = {
            (quote.option_type, quote.strike): quote.greeks.delta
            for quote in quotes.items
            if quote.greeks
        }

        self.assertGreater(deltas[("call", 290.0)], deltas[("call", 315.0)])
        self.assertAlmostEqual(deltas[("put", 315.0)], deltas[("call", 315.0)] - 1)

    def test_fixture_expiry_changes_quotes_and_every_greek(self) -> None:
        symbols = [
            "ETHA  260821C00014000",
            "ETHA  260918C00014000",
            "ETHA  261016C00014000",
        ]
        quotes = asyncio.run(self.adapter.get_quotes(symbols, PricingMode.MIDPOINT)).items

        self.assertEqual(len({quote.selected_price for quote in quotes}), 3)
        for field in ("implied_volatility", "delta", "gamma", "theta", "vega", "rho"):
            values = [getattr(quote.greeks, field) for quote in quotes]
            self.assertEqual(len(set(values)), 3, field)

    def test_fixture_option_bid_midpoint_and_ask_are_visibly_distinct(self) -> None:
        symbol = "ETHA  260918C00014000"
        prices = [
            asyncio.run(self.adapter.get_quotes([symbol], mode)).items[0].selected_price
            for mode in (PricingMode.BID, PricingMode.MIDPOINT, PricingMode.ASK)
        ]

        self.assertLess(prices[0], prices[1])
        self.assertLess(prices[1], prices[2])

    def test_live_adapter_fails_closed_without_credentials(self) -> None:
        adapter = TastytradeMarketDataAdapter(None, None)

        with self.assertRaises(MarketDataNotConfigured):
            asyncio.run(adapter.search_symbols("ETHA"))

    def test_price_selection_falls_back_to_last_for_midpoint_without_a_market(self) -> None:
        self.assertEqual(_select_price(None, None, 1.25, PricingMode.MIDPOINT), 1.25)


if __name__ == "__main__":
    unittest.main()
