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
        self.assertEqual(
            {contract.option_type for contract in chain.expirations[0].contracts},
            {"call", "put"},
        )

    def test_fixture_quote_honours_selected_pricing_mode(self) -> None:
        quotes = asyncio.run(
            self.adapter.get_quotes(["ETHA"], PricingMode.ASK)
        )

        self.assertEqual(quotes.items[0].selected_price, 14.23)
        self.assertEqual(quotes.pricing_mode, PricingMode.ASK)
        self.assertEqual(quotes.items[0].observed_at.tzinfo.utcoffset(None).total_seconds(), 0)

    def test_fixture_option_quote_contains_greeks_and_contract_metadata(self) -> None:
        symbol = "ETHA  260918C00014000"
        quotes = asyncio.run(self.adapter.get_quotes([symbol], PricingMode.MIDPOINT))
        quote = quotes.items[0]

        self.assertEqual(quote.instrument_type, "equity_option")
        self.assertEqual(quote.expiration_date, date(2026, 9, 18))
        self.assertEqual(quote.strike, 14.0)
        self.assertIsNotNone(quote.greeks)
        self.assertEqual(quote.greeks.delta, 0.56)

    def test_live_adapter_fails_closed_without_credentials(self) -> None:
        adapter = TastytradeMarketDataAdapter(None, None)

        with self.assertRaises(MarketDataNotConfigured):
            asyncio.run(adapter.search_symbols("ETHA"))

    def test_price_selection_falls_back_to_last_for_midpoint_without_a_market(self) -> None:
        self.assertEqual(_select_price(None, None, 1.25, PricingMode.MIDPOINT), 1.25)


if __name__ == "__main__":
    unittest.main()
