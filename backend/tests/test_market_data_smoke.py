import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from options_emulator.market_data import FixtureMarketDataAdapter, PricingMode
from options_emulator.market_data_smoke import _load_private_env, run_smoke


class MarketDataSmokeTests(unittest.TestCase):
    def test_fixture_summary_is_read_only_and_contains_observation_context(self) -> None:
        result = asyncio.run(run_smoke(FixtureMarketDataAdapter(), "ETHA", PricingMode.MIDPOINT))

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["safety"]["broker_access"], "read_only")
        self.assertFalse(result["safety"]["mutating_operations_performed"])
        self.assertEqual(result["quotes"]["pricing_mode"], "midpoint")
        self.assertTrue(result["quotes"]["items"])
        self.assertIn("observed_at", result["chain"])
        self.assertIn("delta", result["greeks"]["items"][0])

    def test_private_env_loader_does_not_replace_process_values(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text(
                "TASTY_CLIENT_SECRET=file-secret\nTASTY_REFRESH_TOKEN='file-token'\n",
                encoding="utf-8",
            )
            with patch.dict(os.environ, {"TASTY_CLIENT_SECRET": "process-secret"}, clear=False):
                os.environ.pop("TASTY_REFRESH_TOKEN", None)
                _load_private_env(path)
                self.assertEqual(os.environ["TASTY_CLIENT_SECRET"], "process-secret")
                self.assertEqual(os.environ["TASTY_REFRESH_TOKEN"], "file-token")

    def test_summary_is_json_serialisable_without_adapter_credentials(self) -> None:
        result = asyncio.run(run_smoke(FixtureMarketDataAdapter(), "ETHA", PricingMode.MIDPOINT))

        encoded = json.dumps(result)
        self.assertNotIn("TASTY_CLIENT_SECRET", encoded)
        self.assertNotIn("TASTY_REFRESH_TOKEN", encoded)


if __name__ == "__main__":
    unittest.main()
