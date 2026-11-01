param(
    [string]$ApplicationPath,
    [string]$DestinationDirectory = [Environment]::GetFolderPath('Desktop')
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $ApplicationPath) {
    $ApplicationPath = Join-Path $repositoryRoot 'release\desktop-build\win-unpacked\Telegram Bot Control.exe'
}
$application = (Resolve-Path -LiteralPath $ApplicationPath).Path
if ([IO.Path]::GetExtension($application) -ne '.exe') { throw 'Choose the Telegram Bot Control executable.' }
if (-not (Test-Path -LiteralPath $DestinationDirectory -PathType Container)) { throw 'The shortcut destination folder does not exist.' }
$shortcutPath = Join-Path ([IO.Path]::GetFullPath($DestinationDirectory)) 'Telegram Bot Control.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $application
$shortcut.WorkingDirectory = Split-Path -Parent $application
$shortcut.IconLocation = "$application,0"
$shortcut.Description = 'Telegram Bot Control — desktop monitoring for aiogram bots'
$shortcut.Save()
Write-Output "Shortcut created: $shortcutPath"
