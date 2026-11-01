"""Example explicit preparation command, executed before every managed launch."""

import argparse
import json
from pathlib import Path

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text(encoding="utf-8-sig"))
    prepared = Path(config["prepared"])
    prepared.write_text("prepared by a separate command", encoding="utf-8")
