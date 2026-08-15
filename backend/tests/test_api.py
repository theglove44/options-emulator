import unittest

from fastapi.testclient import TestClient

from options_emulator.api import create_app
from options_emulator.market_data import (
    FixtureMarketDataAdapter,
    TastytradeMarketDataAdapter,
)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(create_app(FixtureMarketDataAdapter()))

    def test_health_reports_fixture_read_only_mode(self) -> None:
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "fixture")
        self.assertEqual(response.json()["broker_access"], "read_only")

    def test_symbol_search_chain_expirations_quotes_and_greeks(self) -> None:
        search = self.client.get("/api/symbols/search", params={"query": "ETHA"})
        self.assertEqual(search.status_code, 200)
        self.assertEqual(search.json()["items"][0]["symbol"], "ETHA")

        chain = self.client.get("/api/chains/ETHA")
        self.assertEqual(chain.status_code, 200)
        self.assertEqual(len(chain.json()["expirations"]), 6)

        expirations = self.client.get("/api/expirations/ETHA")
        self.assertEqual(expirations.status_code, 200)
        self.assertNotIn("contracts", expirations.json()["expirations"][0])

        option = chain.json()["expirations"][0]["contracts"][0]["symbol"]
        quotes = self.client.get(
            "/api/quotes",
            params=[("symbols", "ETHA"), ("symbols", option), ("pricing_mode", "ask")],
        )
        self.assertEqual(quotes.status_code, 200)
        self.assertEqual(len(quotes.json()["items"]), 2)
        self.assertEqual(quotes.json()["pricing_mode"], "ask")

        greeks = self.client.get("/api/greeks", params={"symbols": option})
        self.assertEqual(greeks.status_code, 200)
        self.assertEqual(greeks.json()["items"][0]["greeks"]["delta"], 0.56)

    def test_quotes_require_at_least_one_symbol(self) -> None:
        response = self.client.get("/api/quotes")

        self.assertEqual(response.status_code, 400)

    def test_live_mode_without_credentials_fails_closed_at_the_api(self) -> None:
        client = TestClient(create_app(TastytradeMarketDataAdapter(None, None)))

        response = client.get("/api/symbols/search", params={"query": "ETHA"})

        self.assertEqual(response.status_code, 503)
        self.assertIn("requires TASTY_CLIENT_SECRET", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
