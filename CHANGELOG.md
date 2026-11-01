# Changelog

## 0.8.0 — 2026-11-01

- Add desktop updates from the official public GitHub Releases repository.
- Check on startup and every six hours, download in the background, and install on explicit restart.
- Add RU/EN update settings, prerelease preference, progress, ready banner and modal manual errors.
- Preserve bot processes, connection profiles and history during desktop updates.
- Publish and verify Windows/Linux update metadata and Windows differential blockmaps.
- Explain one-time migration from older desktop versions and manual ZIP updates.

## 0.7.0 — 2026-11-01

- Launch the bundled browser dashboard with bare `tgbots` or `python -m telegram_bot_control`.
- Automatically open the browser with a single-use loopback sign-in; keep normal owner authentication.
- Use the current interpreter and default data directory without manual setup; retain `desktop` as an optional mode.
- Discover desktop Python runtimes through Windows registrations, launcher, installation directories and PATH.
- Show runtime/SDK readiness, native path pickers and actionable modal connection errors.
- Detect Python paths entered as data directories and offer a one-click correction.
- Add Windows/Linux Python 3.14 checks.

## 0.6.1 — 2026-11-01

- Rewrite installation around ready-made Windows downloads and two-command browser setup.
- Move Node.js/pnpm and source builds into separate developer guides with official download links.
- Remove checkout-specific environment paths from user walkthroughs and show how to locate the user's Python.
- Detect installed Windows desktop applications and show download/browser help when the app is missing.
- Simplify first-run onboarding and PyPI/AI integration instructions.

## 0.6.0 — 2026-11-01

- Explicit `monitor.track_action` events and sync/async `@monitor.action` decorators.
- Per-action counts, user totals, outcomes, duration, timelines and timestamped history.
- Callback compatibility, same-update deduplication, HMAC idempotency keys and separate inbound totals.
- Russian-first GitHub README and bilingual Russian/English PyPI description.
- Copyable AI integration guide in the repository, dashboard and connection wizard.
- Read-only regular-Python discovery alongside existing project virtual environments.
- No additional runtime dependencies.
- Allow bounded startup grace and retry temporary SQLite write locks for cooperative stop.

## 0.5.1 — 2026-10-30

- Retain redacted stdout/stderr for bot startup and preparation failures before SDK connection.
- Automatically expand detailed launch output on failure, with a copy action.
- Bound queued output, line length, per-launch tails and retained launch histories.
- Use unbuffered UTF-8 output for launched Python commands.

## 0.5.0 — 2026-10-30

- Existing logging/Loguru adapters, redacted structured logs, search and retention.
- Per-bot process CPU/RSS/thread sampling and history with restart/gap boundaries.
- Optional bounded on-failure restart policy, backoff, cancellation and stable reset.
- Existing-project wizard with read-only discovery and explicit launch registration.
- Desktop and web UI support with Russian/English text and no new runtime dependency.

## 0.4.0 — 2026-10-30

- Optional web dashboard with owner access key, sessions and configurable port.
- Independent web CLI, desktop web controls and mobile layout.
- Opt-in required environment checks with empty defaults and legacy inferred-profile repair.
- Lightweight base Python dependency set; optional aiogram extra.
- Bundled Inter Latin/Cyrillic fonts and third-party notices.
- Smaller desktop packaging: build-only frontend modules and two Chromium locales.

## 0.3.2 — 2026-10-30

- Centered language-selector arrow in the first-run guide.
- Visible Connect a bot action with direct access to SDK integration instructions.
- Current data directory and an existing-bot connection action on the empty dashboard.
- Clear distinction between checking Python and integrating a new aiogram bot.

## 0.3.1 — 2026-10-30

- Close-to-tray, restore/guide/exit tray actions and single-instance activation.
- Persistent Russian/English first-run guide with connection checks and aiogram snippets.
- Replayable guide with keyboard focus, Escape and copy buttons.
- Desktop/Start Menu shortcuts on Windows install/update and a portable shortcut helper.
- Explicit local CLI data-directory overrides and Python discovery inside source checkouts.
- Detailed first-run documentation and desktop lifecycle integration checks.

## 0.3.0 — 2026-10-30

First portfolio preview release.

- Embedded aiogram middleware for messages, commands, callbacks and errors.
- Per-bot SQLite WAL storage and a JSON-lines bridge over stdio or SSH.
- Persistent bot/session registration and heartbeat-based state.
- Aggregate analytics, exact unique-user counts over a date range and grouped errors.
- Dark Electron interface in Russian and English.
- Start, graceful stop and restart from a bot card.
- Explicit launch profiles: arguments, working directory, preparation and environment files.
- PID reuse checks, duplicate-start protection and confirmed forced termination.
- Offline aiogram examples with routers, FSM, preparation and PowerShell launch tests.
- Configurable retention, cleanup preview and consistent SQLite backups.
- MIT license, original application icon, synthetic screenshots and release automation.

Known limits: one owner/server, one OS process per independently controlled bot,
no systemd/Windows-service adapters, unsigned desktop binaries, separate Python install.
GitHub CI and Linux builds are configured; hosted results are only available after publishing.
