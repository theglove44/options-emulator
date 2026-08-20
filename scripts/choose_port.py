"""Choose a free localhost port without terminating the current listener."""

from __future__ import annotations

import socket
import sys


def choose_available_port(start_port: int, search_limit: int = 100) -> int:
    if not 1 <= start_port <= 65535:
        raise ValueError("start_port must be between 1 and 65535")
    final_port = min(start_port + search_limit, 65536)
    for port in range(start_port, final_port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as candidate:
            try:
                candidate.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError(f"no free localhost port found from {start_port} to {final_port - 1}")


if __name__ == "__main__":
    try:
        print(choose_available_port(int(sys.argv[1])))
    except (IndexError, ValueError, RuntimeError) as error:
        print(f"Could not choose a local port: {error}", file=sys.stderr)
        raise SystemExit(2) from error
