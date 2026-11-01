param(
    [Parameter(Mandatory=$true)][string]$Python,
    [Parameter(Mandatory=$true)][string]$Config,
    [Parameter(Mandatory=$true)][string]$Report,
    [Parameter(Mandatory=$true)][string]$BotId,
    [string]$Label = 'PowerShell workflow'
)
# Parameter values are passed as arguments. No Invoke-Expression or command strings.
& $Python -m complex_aiogram_bot --config $Config --report $Report --bot-id $BotId --label $Label
exit $LASTEXITCODE
