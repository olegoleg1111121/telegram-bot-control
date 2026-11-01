# Contributing

Start with the [developer setup](docs/development.en.md) / [инструкция разработчика](docs/development.ru.md). It links Node.js downloads and explains pnpm installation.
Use your chosen Python 3.11+ interpreter.

```powershell
python -m pip install -e '.[dev,release]'
pnpm install --dir desktop --frozen-lockfile
python -m pytest -q
python -m ruff check src scripts tests examples
python -m ruff format --check src scripts tests examples
pnpm --dir desktop run test
pnpm --dir desktop run format:check
pnpm --dir desktop run build
```

On Linux, use python3. An existing isolated development environment is optional.
No real bot token is needed for tests. Integration fixtures exercise actual aiogram
dispatchers, routers and FSM through an offline session.

The build also generates SDK web assets. Build the frontend before Python wheel/sdist
creation. The base package needs psutil; the dev extra adds aiogram for integration
tests. The web UI test requires a fresh empty data directory, starts a synthetic
complex bot through HTTP and stops it during cleanup. Do not point it at real data.

For process-control UI changes, prepare the fixture and run the real Electron flow:

```powershell
python scripts/control_fixture.py --data-dir .test-data/ui-controls --project-dir '.test-data/Complex UI bot'
$env:BOTCONTROL_HOME = (Resolve-Path .test-data/ui-controls).Path
pnpm --dir desktop run smoke:control
```

Use xvfb-run -a for headless Linux UI tests. Only CI disables Electron's OS sandbox;
do not carry that setting into a production launcher.

For onboarding, connection or tray changes, run `pnpm --dir desktop run smoke:experience`
with `BOTCONTROL_PYTHON` pointing to this project's Python and `BOTCONTROL_HOME` set to
an isolated empty directory. It checks the guide, failed/successful connections,
persistence, tray restore, repeated launch and explicit quit. It never uses real tokens.

Keep changes focused and document behavioral limitations. Add meaningful tests for
state transitions, storage semantics or process control. Run scripts/release_check.py
before publishing. Never add tokens, .env, runtime databases or generated binaries
to source control. Release binaries belong in release assets.
