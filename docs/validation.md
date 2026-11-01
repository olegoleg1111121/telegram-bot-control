# Validation record

## First public release — 2026-11-01

[GitHub CI](https://github.com/olegoleg1111121/telegram-bot-control/actions/runs/41306619096)
passed all seven jobs: Python 3.11/3.12 on Windows and Ubuntu 24.04, desktop controls
and onboarding/browser flows on both operating systems, and package/code quality.

[Release builds](https://github.com/olegoleg1111121/telegram-bot-control/actions/runs/41307136551)
produced Windows setup, Linux AppImage, wheel, source distribution and tagged source.
The GitHub-built Python archives were downloaded, checked against SHA256SUMS and
scanned for private paths and credentials. The wheel installed into an isolated
environment and reported `tgbots 0.5.1`. A Windows portable ZIP with upstream license
notices was added to the public preview release with its SHA256 digest.

This validates hosted Linux execution, not a physical Termux device or a real SSH
connection to the intended production server.

[PyPI publication](https://github.com/olegoleg1111121/telegram-bot-control/actions/runs/41307728202)
completed through the configured OIDC trusted publisher. A clean virtualenv then
installed `telegram-bot-control[aiogram]==0.5.1` directly from pypi.org with cache
disabled. Imports resolved to site-packages, not the editable checkout; the published
SDK processed an offline aiogram pipeline, persisted statistics/errors/logs, served
its bundled web assets and reported `tgbots 0.5.1`.

## Startup diagnostics fix 0.5.1

All 56 Python tests and 7 Node tests passed on local Windows. New cases cover
pre-SDK ModuleNotFoundError and Unicode output, failed preparation stderr, split
secret values, ANSI color sequences, long lines and bounded noisy output. The final
12-case diagnostics suite passed again after the redaction-order adjustment.

The Electron/browser flow exercised a project failing before SDK initialization
and verified an expanded, persisted stderr traceback in the process panel. The
existing real test bot was recovered from missing terminal-only environment data;
both SDK registration and Telegram polling were confirmed. Runtime env configuration
and credentials remain in ignored local files and are excluded from release assets.

## Diagnostics and project wizard 0.5.0

All 53 Python tests and 7 Node tests passed locally on Windows. Coverage includes
preserving existing logging handlers, threaded records, traceback redaction,
Loguru sink protocol, current-process sampling, old mailbox compatibility, project
discovery without executing code or reading .env, finite restart limits, recovery
after a crash, cancellation during backoff and rejection of duplicate launches.

The source Electron/browser flow passed: existing logger records/search, per-bot
resource charts, saving a restart policy, wizard registration with optional empty
env-file, Start/Restart/Stop over HTTP, login/logout, phone layout, RU/EN onboarding,
tray lifecycle and single-instance activation. This is not a physical Termux test.

The same flow also passed in the packaged Windows application. A real Loguru 0.7.3
installation in an isolated test directory preserved its existing sink while copying
INFO and exception records to the mailbox with credential redaction. Loguru remains
an optional dependency of the bot, not a dashboard dependency.

## Desktop/web update 0.4.0

All 44 Python tests and 7 Node tests passed on local Windows. New Python coverage
includes optional environment checks, legacy inferred profiles, restricted process
identity, HTTP authentication, cookie/session invalidation, Origin checks, login
throttling, private-path rejection and retention-confirmation enforcement.

The Electron experience flow starts/stops the optional listener on a chosen port,
logs in through a separate browser renderer without Node/preload, starts/restarts/
stops a complex offline aiogram bot over HTTP, checks the shared snapshot, verifies
local Cyrillic font loading, signs out and checks a phone-sized layout. The default
SDK/desktop path still opens no HTTP listener. npm audit reported no known issues.

An isolated base-wheel installation contains no aiogram and serves the bundled web
UI successfully. Real Android/Termux behavior and hosted CI remain unverified.
The final packaged Windows build also passed the same browser/process-control flow.
The light Windows environment occupied about 13 MiB excluding its shared Python
runtime. Desktop packaging measurements are recorded in [size report](size-report.md).

## Desktop update 0.3.2

All 7 Node tests and the Electron experience flow passed locally. The UI test now
checks language-arrow centering in Russian and English, direct access to the aiogram
integration step from Connect a bot, and access to connection settings from the
existing-bot action on an empty dashboard. Existing data directories are selected
explicitly; checking the Python interpreter alone does not register new bots.
The same flow passed in the packaged Windows application. A development connection
to an existing live fixture was restored without changing that bot's sessions or PIDs.

## Desktop update 0.3.1

On 2026-10-30, all 35 Python tests and 7 Node tests passed locally on Windows.
The first-run Electron flow exercised Russian/English, an invalid and a valid Python
connection, preservation of the working connection after a failed attempt, Python
syntax validation of the displayed integration snippet, saved guide state, replay
and Escape. It also checked actual window close/hide, a live bridge while hidden,
tray restoration, activation by a second application process and explicit tray exit.
The separate complex-bot UI check covers Start → Restart → Stop.

The guide is also visually reviewed. Windows packaging includes explicit Desktop
and Start Menu shortcut creation; portable launches need a separately created link.
The same guide/tray flow passed in a separate copy of the packaged 0.3.1 application.
A local Desktop shortcut was created and read back to verify its target and version.
Target Linux desktop/tray behavior and hosted GitHub CI remain pending.

Locally exercised: Windows Server, Python 3.12.14, aiogram 3.31.0, psutil 7.2.2,
Node 24.19.0, Electron 43.8.4 and React 19.3.1.

The Python suite covers real aiogram routers/FSM, telemetry semantics, retention,
backups, process identity, ordinary/module/PowerShell launches, preparation,
environment files, concurrency, graceful/forced stop and release-source checks.
Node tests use the actual Python stdio reader. Electron tests select bot cards,
expand errors, change languages, confirm cleanup and press Start → Restart → Stop.
Screenshots are inspected visually.

A live aiogram bot was registered and restarted during development, preserving its
history. Its identity, credentials, PIDs and databases are excluded from publication.

Public screenshots use generated demo records and an offline complex aiogram fixture.
Server labels are anonymized by the capture harness. They do not represent production
traffic or a public customer deployment.

## Historical performance baseline

Version 0.2.0, 100 offline bots, 100 events/s for 10 seconds on local Windows with
empty databases: 1000 sent / 1000 recorded, zero drops and write failures. Snapshot
latency with tracemalloc was about 430 ms and Python allocations peaked at 4.54 MiB.
This is a short functional baseline, not a capacity guarantee for v0.3.0 or a large
retained history.

## Original 0.3.0 release verification

On 2026-10-30, a fresh directory was populated from the reviewed Git index, with
no runtime databases, credentials or installed dependencies copied from development.
Creating a new Python environment and installing `.[dev]` succeeded. All **35 Python
tests** and **3 Node bridge tests** passed; none were skipped. Ruff, Prettier,
TypeScript/Vite build, dependency consistency and local documentation links passed.
The pnpm audit reported zero known vulnerabilities at that time.
The Windows NSIS installer built successfully. A separate copy of the packaged
application passed the Start → Restart → Stop UI flow with the complex offline bot.

Local preparation checks formatting, types/build, offline tests, package metadata,
Git-visible source, versions, credential patterns and source archives. The source ZIP
uses the reviewed Git index. SHA256 sums identify the prepared assets.

Pending: actual hosted CI after the first push, Linux/SSH on the intended server,
AppImage validation, longer stress tests, code signing and service-manager adapters.
Python is installed separately from the desktop runtime.
