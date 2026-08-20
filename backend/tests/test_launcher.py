import importlib.util
import socket
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).parents[2] / "scripts" / "choose_port.py"
SPEC = importlib.util.spec_from_file_location("choose_port", SCRIPT_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class LauncherPortTests(unittest.TestCase):
    def test_occupied_port_moves_to_a_free_port_without_touching_listener(self) -> None:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            occupied_port = listener.getsockname()[1]

            selected_port = MODULE.choose_available_port(occupied_port)

            self.assertNotEqual(selected_port, occupied_port)
            self.assertGreater(selected_port, occupied_port)
            listener.listen()

    def test_invalid_start_port_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "between 1 and 65535"):
            MODULE.choose_available_port(0)


if __name__ == "__main__":
    unittest.main()
