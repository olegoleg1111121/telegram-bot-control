param(
    [ValidatePattern('^[A-Za-z0-9_.-]+$')][string]$Name = 'telegram-bot-control',
    [switch]$Publish
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repositoryRoot

if (-not $Publish) {
    Write-Output 'Offline preparation mode. Nothing is uploaded.'
    Write-Output 'When ready: install GitHub CLI, sign in, then run:'
    Write-Output '.\scripts\publish_github.ps1 -Publish'
    Write-Output 'The script uses your actual GitHub identity and creates a public repository.'
    Write-Output 'It pushes main and v0.7.0; Actions then prepare a draft release for review.'
    exit 0
}

$gitCommand = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCommand) {
    $desktopRoot = Join-Path $env:LOCALAPPDATA 'GitHubDesktop'
    $bundledGit = Get-ChildItem -LiteralPath $desktopRoot -Directory -Filter 'app-*' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        ForEach-Object { Join-Path $_.FullName 'resources\app\git\cmd\git.exe' } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
    if ($bundledGit) {
        $env:PATH = (Split-Path -Parent $bundledGit) + [IO.Path]::PathSeparator + $env:PATH
        $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    }
}
if (-not $gitCommand) { throw 'Install Git or open a terminal with Git on PATH first.' }
$ghCommand = Get-Command gh -ErrorAction SilentlyContinue
$ghPath = if ($ghCommand) { $ghCommand.Source } else { Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe' }
if (-not (Test-Path -LiteralPath $ghPath)) {
    $portableGh = Join-Path $repositoryRoot '.local-tools\github-cli\bin\gh.exe'
    if (Test-Path -LiteralPath $portableGh) { $ghPath = $portableGh }
}
if (-not (Test-Path -LiteralPath $ghPath)) { throw 'Install GitHub CLI first, then run gh auth login --web.' }
& $ghPath auth status
if ($LASTEXITCODE -ne 0) { throw 'Sign in with gh auth login --web first. No repository was created.' }

if (Test-Path -LiteralPath '.venv\Scripts\python.exe') { $pythonPath = (Resolve-Path '.venv\Scripts\python.exe').Path }
elseif (Get-Command python -ErrorAction SilentlyContinue) { $pythonPath = (Get-Command python).Source }
else { throw 'Select a Python environment with this project installed.' }
& $pythonPath scripts/release_check.py
if ($LASTEXITCODE -ne 0) { throw 'Release checks failed. Nothing was uploaded.' }

$identityJson = & $ghPath api user
if ($LASTEXITCODE -ne 0) { throw 'Could not read your authenticated GitHub identity.' }
$identity = $identityJson | ConvertFrom-Json
$owner = [string]$identity.login
$authorName = if ($identity.name) { [string]$identity.name } else { $owner }
$authorEmail = "$($identity.id)+$owner@users.noreply.github.com"
$repository = "$owner/$Name"

$remote = $null
$remotes = @(& git remote)
if ($LASTEXITCODE -ne 0) { throw 'Could not read local Git remotes.' }
if ($remotes -contains 'origin') {
    $remote = & git remote get-url origin
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the origin URL.' }
}
if ($remote -and $remote -notmatch ('github\.com[:/]' + [regex]::Escape($repository) + '(\.git)?$')) {
    throw 'An unrelated origin remote is configured; inspect it before publishing.'
}
& git config --local user.name $authorName
& git config --local user.email $authorEmail
& git add --all
& $pythonPath scripts/release_check.py --staged-only
if ($LASTEXITCODE -ne 0) { throw 'Staged content did not pass release checks.' }
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    & git commit -m 'Prepare Telegram Bot Control v0.7.0'
    if ($LASTEXITCODE -ne 0) { throw 'Local commit failed.' }
}
& git rev-parse --verify HEAD 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No local commit is available to publish.' }

# Windows PowerShell 5 treats native stderr as ErrorRecords, even for a probe.
$ErrorActionPreference = 'Continue'
& $ghPath repo view $repository --json name 2>$null | Out-Null
$repositoryExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = 'Stop'
if (-not $repositoryExists) {
    & $ghPath repo create $repository --public --description 'Embedded monitoring and process control for aiogram bots: desktop, SSH and optional web dashboard.'
    if ($LASTEXITCODE -ne 0) { throw 'Repository creation failed.' }
}
if (-not $remote) {
    & git remote add origin "https://github.com/$repository.git"
    if ($LASTEXITCODE -ne 0) { throw 'Could not configure the origin remote.' }
}
& $ghPath auth setup-git
if ($LASTEXITCODE -ne 0) { throw 'Git authentication setup failed.' }
& git push --set-upstream origin main
if ($LASTEXITCODE -ne 0) { throw 'Push failed; remote history was not overwritten.' }
& git tag --list v0.7.0 | Tee-Object -Variable existingTag | Out-Null
if (-not $existingTag) {
    & git tag -a v0.7.0 -m 'Telegram Bot Control v0.7.0'
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the release tag.' }
}
& git push origin v0.7.0
if ($LASTEXITCODE -ne 0) { throw 'Tag push failed; existing remote tags were not overwritten.' }
Write-Output "Published source: https://github.com/$repository"
Write-Output 'Actions will prepare a draft release after builds finish. Review it before publishing the release.'
