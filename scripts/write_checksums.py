"""Write SHA256SUMS for assembled release assets."""

import argparse
from pathlib import Path

from prepare_release import checksums

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    result = checksums(parser.parse_args().directory)
    print(f"Wrote SHA256SUMS.txt for {len(result)} release assets")
