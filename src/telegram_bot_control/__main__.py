"""Allow launching the CLI with python -m telegram_bot_control."""

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
