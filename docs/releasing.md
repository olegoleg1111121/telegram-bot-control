# Preparing and publishing a release

Local preparation needs no GitHub account. Authentication is required only for remote
repository creation and publication.

First complete the [developer setup](development.en.md), including Node.js and pnpm installation.

## Verify locally

Install the project with `python -m pip install -e '.[dev,release]'`, then run Python
tests, Ruff, Node tests, `pnpm --dir desktop run format:check`, the desktop build and
`python scripts/release_check.py`. See CONTRIBUTING.md for the full commands.

The checker inspects Git-visible source, versions, private paths and common credential
formats. It prints rule names and filenames, never credential values. Pattern scanning
is useful but cannot prove that every possible secret has been excluded.

## Build local artifacts

```powershell
pnpm --dir desktop exec electron-builder --win nsis --publish never --config.directories.output=../release/desktop-build
git add --all
python scripts/release_check.py --staged-only
python scripts/prepare_release.py --desktop --desktop-dir release/desktop-build
```

The ignored `release/v0.6.1/` folder contains source ZIP, Python wheel/source distribution,
Windows installer, portable folder ZIP, SHA256 sums and an exact source-tree manifest.
Only reviewed, staged content is archived. No author identity or initial commit is
needed for the local source archive. Built source archives are scanned again.

The desktop is unsigned and Python is installed separately. Keep upstream license
files with the portable application.

## Publish after signing in

The publishing script needs [GitHub CLI](https://github.com/cli/cli#installation)
and Git. It can find the Git version bundled with
[GitHub Desktop](https://desktop.github.com/download/). GitHub Desktop alone also
supports the manual publication workflow described below.

Preview the steps without uploading:

```powershell
.\scripts\publish_github.ps1
```

Create the public portfolio repository when ready:

```powershell
gh auth login --web
.\scripts\publish_github.ps1 -Publish
```

The explicit flag enables publication. The script uses the authenticated user's real
name/login and GitHub noreply address, configures identity only for this repository,
creates the first commit, and pushes `main` plus `v0.6.1` to `telegram-bot-control`.
It does not force-push or replace an unrelated remote. Use `-Name another-name` to
choose a different repository name.

The tag workflow builds Python distributions, Windows setup and Linux AppImage,
assembles checksums and creates a draft prerelease. Inspect the jobs and assets
before publishing the draft. No hosted CI result is claimed by the offline bundle.

GitHub Desktop can also add this folder with File → Add local repository. After
signing in, configure your Git identity, commit the reviewed files and use Publish
repository. Push the version tag to start the draft-release workflow.

For a later version, update Python/module/desktop versions, changelog and release
notes together, then verify and tag. The current publishing helper targets v0.6.1.

PyPI publication uses the separate Trusted Publishing workflow. See [setup instructions](pypi.ru.md).
