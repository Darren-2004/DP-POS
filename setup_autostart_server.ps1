$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ecosystemPath = Join-Path $projectRoot 'ecosystem.config.cjs'
$startedWithPm2 = $false

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python was not found on PATH. Install Python and the packages in requirements.txt first.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm was not found on PATH. Install Node.js first.'
}
if (-not (Test-Path (Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'))) {
    throw 'Vite dependencies are missing. Run npm install in the frontend folder first.'
}

$pm2Command = Get-Command pm2.cmd -ErrorAction SilentlyContinue
if (-not $pm2Command) {
    Write-Host 'Installing PM2 globally...'
    npm install --global pm2
    if ($LASTEXITCODE -ne 0) {
        throw 'PM2 installation failed.'
    }
    $npmPrefix = (npm config get prefix).Trim()
    $pm2Path = Join-Path $npmPrefix 'pm2.cmd'
} else {
    $pm2Path = $pm2Command.Source
}

if (-not (Test-Path $pm2Path)) {
    throw "PM2 command was not found at $pm2Path."
}

Push-Location $projectRoot
try {
    $occupiedPorts = Get-NetTCPConnection -State Listen -LocalPort 5000, 5173 -ErrorAction SilentlyContinue
    if ($occupiedPorts) {
        Write-Warning 'Ports 5000 or 5173 are already in use. Leaving the current services untouched; PM2 will start them at the next Windows sign-in.'
    } else {
        & $pm2Path startOrReload $ecosystemPath --update-env
        if ($LASTEXITCODE -ne 0) {
            throw 'PM2 could not start the POS services.'
        }
        & $pm2Path save
        if ($LASTEXITCODE -ne 0) {
            throw 'PM2 could not save the process list.'
        }
        $startedWithPm2 = $true
    }
} finally {
    Pop-Location
}

$startupScript = Join-Path $projectRoot 'start_pos_pm2.ps1'
$taskAction = New-ScheduledTaskAction `
    -Execute (Join-Path $PSHOME 'powershell.exe') `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startupScript`"" `
    -WorkingDirectory $projectRoot
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
Register-ScheduledTask `
    -TaskName 'POS_PM2_Servers' `
    -Action $taskAction `
    -Trigger $taskTrigger `
    -Description 'Restore the POS Python API and Vite server with PM2 at Windows sign-in.' `
    -Force | Out-Null

if (Get-ScheduledTask -TaskName 'POS_Backend_Service' -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName 'POS_Backend_Service' -Confirm:$false
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    foreach ($port in @(5000, 5173)) {
        $ruleName = "POS LAN TCP $port"
        if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule `
                -DisplayName $ruleName `
                -Direction Inbound `
                -Action Allow `
                -Protocol TCP `
                -LocalPort $port `
                -RemoteAddress LocalSubnet `
                -Profile Any | Out-Null
        }
    }
} else {
    Write-Warning 'Run this installer as Administrator to add LAN-only Windows Firewall rules for ports 5000 and 5173.'
}

Write-Host ''
if ($startedWithPm2) {
    Write-Host 'PM2 is running the Python API and Vite. Startup restore is configured for Windows sign-in.'
} else {
    Write-Host 'The existing services were left running. PM2 will start the Python API and Vite at the next Windows sign-in.'
}
Write-Host 'Other devices can connect to http://<this-PC-LAN-IP>:5173 after the network is available.'
Write-Host 'Check the current LAN IP with ipconfig, and process health with: pm2 status'