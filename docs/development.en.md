# Developer source setup

[Русский](development.ru.md) · [English](development.en.md)

Use this guide to change the application itself. For normal use, follow the
[ready-made installation](../README.en.md#install-on-windows).

## Install tools once

1. [Python 3.11+](https://www.python.org/downloads/), or your existing compatible Python.
2. [Node.js 24.x](https://nodejs.org/download/release/latest-v24.x/).
   On Windows x64 choose the `-x64.msi` installer, install it and reopen the terminal.
   npm is included with Node.js.
3. Install the project's pinned pnpm version using npm:

```powershell
node --version
npm.cmd install --global pnpm@11.25.0
pnpm.cmd --version
```

Use `npm`/`pnpm` instead of `.cmd` on Linux.
[Official pnpm installation](https://pnpm.io/installation#using-npm).

## Build

Download and extract the `-source.zip` asset from
[Releases](https://github.com/olegoleg1111121/telegram-bot-control/releases),
or clone the repository. Open a terminal in the directory containing `pyproject.toml`:

```powershell
python -m pip install -e ".[dev,release]"
pnpm.cmd install --dir desktop --frozen-lockfile
pnpm.cmd --dir desktop run build
python -m telegram_bot_control open
```

On Linux use `python3` and `pnpm`. Use your existing chosen development interpreter;
creating another environment is optional. `requirements-dev.lock` provides pinned
Python dependencies. The frontend build also prepares bundled web assets.

## Check and package

```powershell
python -m pytest -q
python -m ruff check src scripts tests examples
pnpm.cmd --dir desktop run test
pnpm.cmd --dir desktop run format:check
pnpm.cmd --dir desktop run dist
```

Desktop distributions are written to `desktop/release/`; build Linux AppImage on Linux.
After building the frontend, use `python -m build` for wheel/sdist.
[Release workflow](releasing.md).
