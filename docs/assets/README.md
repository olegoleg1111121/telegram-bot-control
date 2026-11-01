# Portfolio images

All images use synthetic demo fixtures and anonymous server labels.

Overview and exceptions, using a fresh folder:

```powershell
python scripts/portfolio_fixture.py --data-dir .test-data/portfolio-new
$env:BOTCONTROL_HOME = (Resolve-Path .test-data/portfolio-new).Path
pnpm --dir desktop run screenshots
```

Real process-control UI with an offline bot:

```powershell
python scripts/control_fixture.py --data-dir .test-data/ui-controls --project-dir '.test-data/Complex UI bot'
$env:BOTCONTROL_HOME = (Resolve-Path .test-data/ui-controls).Path
$env:BOTCONTROL_PORTFOLIO = '1'
pnpm --dir desktop run smoke:control
```

Recreate PNG/ICO files from the original SVG with `pnpm --dir desktop run icons`.

The first-run guide is captured with `pnpm --dir desktop run smoke:experience`.
Set `BOTCONTROL_PYTHON` to the installed SDK interpreter and `BOTCONTROL_HOME` to an
isolated empty data directory. The harness anonymizes the server labels for welcome
captures; `onboarding-ru.png` can be copied to `docs/assets/onboarding.png`.
Connection/code-step screenshots can contain local paths and stay in ignored test output.
