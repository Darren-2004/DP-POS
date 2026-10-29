$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ecosystemPath = Join-Path $projectRoot 'ecosystem.config.cjs'

$pm2Command = Get-Command pm2.cmd -ErrorAction SilentlyContinue
if ($pm2Command) {
    $pm2Path = $pm2Command.Source
} else {
    $npmPrefix = (npm config get prefix).Trim()
    $pm2Path = Join-Path $npmPrefix 'pm2.cmd'
}

if (-not (Test-Path $pm2Path)) {
    throw 'PM2 was not found. Run setup_autostart_server.bat again.'
}

Push-Location $projectRoot
try {
    & $pm2Path startOrReload $ecosystemPath --update-env
    if ($LASTEXITCODE -ne 0) {
        throw 'PM2 could not start the POS services.'
    }
    & $pm2Path save
    if ($LASTEXITCODE -ne 0) {
        throw 'PM2 could not save the process list.'
    }
} finally {
    Pop-Location
}