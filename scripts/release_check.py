"""Audit publishable files without printing credentials or requiring GitHub login."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import tarfile
import tomllib
import zipfile
from pathlib import Path

PRIVATE_PARTS = {
    ".git",
    ".venv",
    "node_modules",
    ".test-data",
    ".local-tools",
    ".pnpm-store",
    ".bot-control",
    ".aws",
    ".codex",
    ".agents",
    "__pycache__",
    ".pytest_cache",
}
PRIVATE_SUFFIXES = {
    ".db",
    ".sqlite",
    ".sqlite3",
    ".sqlite3-wal",
    ".sqlite3-shm",
    ".log",
    ".pem",
    ".pfx",
    ".p12",
}
SECRETS = {
    "Telegram token": re.compile(rb"\b\d{5,}:[A-Za-z0-9_-]{20,}\b"),
    "GitHub token": re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b"),
    "AWS access key": re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "private key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
}
MACHINE_PATH = re.compile(rb"[A-Za-z]:[\\/]+Users[\\/]+[A-Za-z0-9_.-]+[\\/]")


def source_files(root: Path, *, staged_only: bool = False) -> list[str]:
    command = ["git", "ls-files", "--cached", "-z"]
    if not staged_only:
        command += ["--others", "--exclude-standard"]
    result = subprocess.run(command, cwd=root, check=True, capture_output=True)
    return sorted(set(part.decode("utf-8") for part in result.stdout.split(b"\0") if part))


def private_path(name: str) -> bool:
    path = Path(name)
    return (
        any(part in PRIVATE_PARTS for part in path.parts)
        or path.suffix.lower() in PRIVATE_SUFFIXES
        or path.name == ".env"
        or path.name.startswith(".env.")
        and path.name != ".env.example"
        or path.name in ("id_rsa", "id_ed25519")
    )


def inspect_bytes(name: str, content: bytes) -> list[str]:
    issues = []
    if private_path(name):
        issues.append(f"{name}: private runtime/configuration file")
    # Screenshots, icons and other binary assets do not contain source-code tokens.
    try:
        content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return issues
    for label, pattern in SECRETS.items():
        if pattern.search(content):
            issues.append(f"{name}: possible {label}; value withheld")
    if MACHINE_PATH.search(content):
        issues.append(f"{name}: machine-specific workspace path")
    return issues


def audit(root: Path, *, staged_only: bool = False) -> list[str]:
    issues = []
    paths = source_files(root, staged_only=staged_only)
    if not paths:
        return ["No publishable source files found"]
    for name in paths:
        path = root / name
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            issues.append(f"{name}: symlink or path outside repository")
            continue
        if not path.is_file():
            issues.append(f"{name}: file is missing")
            continue
        if path.stat().st_size > 10 * 1024 * 1024:
            issues.append(f"{name}: source file exceeds 10 MiB; use release assets")
        issues.extend(inspect_bytes(name, path.read_bytes()))
    python = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8-sig"))
    desktop = json.loads((root / "desktop/package.json").read_text(encoding="utf-8-sig"))
    source = (root / "src/telegram_bot_control/__init__.py").read_text(encoding="utf-8-sig")
    version = re.search(r"__version__\s*=\s*[\"\']([^\"\']+)", source)
    if (
        not version
        or python["project"]["version"] != desktop["version"]
        or version[1] != desktop["version"]
    ):
        issues.append("Python, desktop and module versions differ")
    required = [
        "LICENSE",
        "README.md",
        "README.ru.md",
        "SECURITY.md",
        "CHANGELOG.md",
        ".github/workflows/ci.yml",
        ".github/workflows/release.yml",
    ]
    issues.extend(
        f"{name}: required release file is missing" for name in required if name not in paths
    )
    return issues


def inspect_archive(path: Path) -> list[str]:
    issues = []
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            for item in archive.infolist():
                if not item.is_dir():
                    issues.extend(inspect_bytes(item.filename, archive.read(item)))
    elif tarfile.is_tarfile(path):
        with tarfile.open(path) as archive:
            for item in archive.getmembers():
                if item.isfile():
                    stream = archive.extractfile(item)
                    if stream:
                        issues.extend(inspect_bytes(item.name, stream.read()))
    else:
        issues.append(f"{path.name}: unsupported archive")
    return issues


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--tag")
    parser.add_argument("--staged-only", action="store_true")
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    issues = (
        inspect_archive(args.archive)
        if args.archive
        else audit(args.root, staged_only=args.staged_only)
    )
    if args.tag:
        version = tomllib.loads((args.root / "pyproject.toml").read_text())["project"]["version"]
        if args.tag != f"v{version}":
            issues.append("Release tag does not match package versions")
    if issues:
        print("\n".join(issues))
        return 1
    print("Release check passed: versions, required files and publishable content.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
