"""Build a clean local release bundle from the Git index; never upload it."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tomllib
import zipfile
from pathlib import Path

from release_check import audit, inspect_archive


def checksums(directory: Path) -> dict[str, dict]:
    result = {}
    for path in sorted(directory.iterdir()):
        if path.is_file() and path.name not in ("SHA256SUMS.txt", "manifest.json"):
            with path.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            result[path.name] = {"sha256": digest, "bytes": path.stat().st_size}
    (directory / "SHA256SUMS.txt").write_text(
        "".join(f"{item['sha256']}  {name}\n" for name, item in result.items()), encoding="utf-8"
    )
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--desktop",
        action="store_true",
        help="Include the existing Windows unpacked app and installer",
    )
    parser.add_argument("--desktop-dir", type=Path, help="electron-builder output directory")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    version = tomllib.loads((root / "pyproject.toml").read_text())["project"]["version"]
    output = (args.output or root / "release" / f"v{version}").resolve()
    if not output.is_relative_to(root / "release"):
        raise SystemExit("Release output must be inside this repository’s release/ directory")
    issues = audit(root, staged_only=True)
    if issues:
        raise SystemExit("\n".join(issues))
    if subprocess.run(["git", "diff", "--quiet"], cwd=root).returncode:
        raise SystemExit("Stage the reviewed source changes before preparing the release")
    output.mkdir(parents=True, exist_ok=True)
    tree = subprocess.check_output(["git", "write-tree"], cwd=root, text=True).strip()
    source = output / f"telegram-bot-control-{version}-source.zip"
    subprocess.run(
        [
            "git",
            "archive",
            "--format=zip",
            f"--prefix=telegram-bot-control-{version}/",
            "-o",
            str(source),
            tree,
        ],
        cwd=root,
        check=True,
    )
    subprocess.run([sys.executable, "-m", "build", "--outdir", str(output)], cwd=root, check=True)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "twine",
            "check",
            *map(str, output.glob("*.whl")),
            *map(str, output.glob("*.tar.gz")),
        ],
        cwd=root,
        check=True,
    )
    for path in [source, *output.glob("*.whl"), *output.glob("*.tar.gz")]:
        found = inspect_archive(path)
        if found:
            raise SystemExit("\n".join(found))
    if args.desktop:
        import shutil

        desktop_dir = (args.desktop_dir or root / "desktop/release").resolve()
        if not desktop_dir.is_relative_to(root):
            raise SystemExit("Desktop build must be inside this workspace")
        unpacked = desktop_dir / "win-unpacked"
        if not (unpacked / "Telegram Bot Control.exe").exists():
            raise SystemExit("Build the Windows desktop app first")
        for notice in (
            "LICENSE.electron.txt",
            "LICENSES.chromium.html",
            "resources/PROJECT-LICENSE.txt",
            "resources/THIRD_PARTY_NOTICES.md",
        ):
            if not (unpacked / notice).is_file():
                raise SystemExit(f"Desktop distribution is missing a license notice: {notice}")
        with zipfile.ZipFile(
            output / f"Telegram-Bot-Control-{version}-windows-x64.zip", "w", zipfile.ZIP_DEFLATED
        ) as archive:
            for path in sorted(unpacked.rglob("*")):
                if path.is_file():
                    relative = path.relative_to(unpacked)
                    archive.write(path, str(Path(f"Telegram-Bot-Control-{version}") / relative))
        installers = list(desktop_dir.glob(f"Telegram-Bot-Control-{version}-win-*.exe"))
        if not installers:
            raise SystemExit(f"No Windows installer found for version {version}")
        for path in installers:
            shutil.copy2(path, output / path.name)
    files = checksums(output)
    (output / "manifest.json").write_text(
        json.dumps(
            {"version": version, "source_tree": tree, "status": "prepared-offline", "files": files},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Release ready locally: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
