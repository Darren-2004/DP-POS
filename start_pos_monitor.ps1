$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ecosystemPath = Join-Path $projectRoot 'ecosystem.config.cjs'
$frontendEntry = Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'

function Test-HttpEndpoint([string]$Url) {
    try {
        $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        return $true
    } catch {
        return $false
    }
}

function Start-PosService([string]$Name, [string]$HealthUrl, [int]$Port) {
    if (Test-HttpEndpoint $HealthUrl) {
        Write-Host "$Name is already running."
        return
    }

    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($listener) {
        throw "Port $Port is occupied, but $Name did not answer at $HealthUrl. Close the other program using port $Port, then run Start_POS.bat again."
    }

    Write-Host "Starting $Name..."
    & $script:pm2Path startOrReload $ecosystemPath --only $Name --update-env
    if ($LASTEXITCODE -ne 0) {
        throw "PM2 could not start $Name."
    }

    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if (Test-HttpEndpoint $HealthUrl) {
            Write-Host "$Name is ready."
            return
        }
        Start-Sleep -Seconds 1
    }

    throw "$Name did not become ready at $HealthUrl within 60 seconds."
}

function Clear-PosPorts {
    foreach ($name in @('pos-python-backend', 'pos-vite-frontend')) {
        Write-Host "Stopping PM2 process $name if it is running..."
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $pm2Output = (& $script:pm2Path delete $name 2>&1 | Out-String)
            $pm2ExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }

        if ($pm2ExitCode -ne 0) {
            if ($pm2Output -match '(?s)Process or Namespace .*?not found') {
                Write-Host "No running PM2 process named $name."
            } else {
                throw "Could not stop PM2 process $name. $pm2Output"
            }
        }
    }

    $listeners = @(
        Get-NetTCPConnection -State Listen -LocalPort 5000, 5173 -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
    foreach ($processId in $listeners) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Stopping $($process.ProcessName) (PID $processId), listening on POS port 5000 or 5173..."
            Stop-Process -Id $processId -Force -ErrorAction Stop
        }
    }

    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        $remainingListeners = Get-NetTCPConnection -State Listen -LocalPort 5000, 5173 -ErrorAction SilentlyContinue
        if (-not $remainingListeners) {
            Write-Host 'Ports 5000 and 5173 are free.'
            return
        }
        Start-Sleep -Seconds 1
    }

    throw 'Could not free ports 5000 and 5173.'
}

try {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        throw 'Python was not found. Install Python and the packages in requirements.txt first.'
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'Node.js/npm was not found. Install Node.js first.'
    }
    if (-not (Test-Path $frontendEntry)) {
        throw 'Vite is not installed in frontend. Run npm install in the frontend folder first.'
    }

    $pm2Command = Get-Command pm2.cmd -ErrorAction SilentlyContinue
    if ($pm2Command) {
        $script:pm2Path = $pm2Command.Source
    } else {
        $npmPrefix = (npm config get prefix).Trim()
        $script:pm2Path = Join-Path $npmPrefix 'pm2.cmd'
    }
    if (-not (Test-Path $script:pm2Path)) {
        throw 'PM2 is not installed. Run setup_autostart_server.bat once to install it.'
    }

    Push-Location $projectRoot
    try {
        Clear-PosPorts
        Start-PosService 'pos-python-backend' 'http://127.0.0.1:5000/api/heartbeat' 5000
        Start-PosService 'pos-vite-frontend' 'http://127.0.0.1:5173/' 5173
        & $script:pm2Path save
        if ($LASTEXITCODE -ne 0) {
            throw 'PM2 could not save the running services.'
        }
        $kioskLauncher = Join-Path $projectRoot 'Lancer_Caisse.bat'
        if (-not (Test-Path $kioskLauncher)) {
            throw 'Lancer_Caisse.bat was not found beside the project.'
        }
        Write-Host 'Opening kiosk Chrome on this server PC...'
        & $kioskLauncher 'http://127.0.0.1:5173'
    } finally {
        Pop-Location
    }

    Write-Host ''
    Write-Host 'POS servers are ready. This window will show the network link when an address is available.' -ForegroundColor Green
    Write-Host 'Open the link from another device connected to the same Wi-Fi or Ethernet network.'
    Write-Host 'Keep this window open to watch for network connections or IP address changes.'
    Write-Host ''

    $lastAddressList = ''
    while ($true) {
        $addresses = @(
            Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred -ErrorAction SilentlyContinue |
                Where-Object {
                    $_.IPAddress -ne '127.0.0.1' -and
                    $_.IPAddress -notlike '169.254.*'
                } |
                Select-Object -ExpandProperty IPAddress -Unique |
                Sort-Object
        )
        $addressList = $addresses -join ','

        if ($addressList -ne $lastAddressList) {
            if ($addresses.Count -eq 0) {
                Write-Host 'No network address yet. Waiting for Wi-Fi or Ethernet...' -ForegroundColor Yellow
            } else {
                Write-Host "`nNetwork address available: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Cyan
                foreach ($address in $addresses) {
                    Write-Host "  POS link: http://${address}:5173" -ForegroundColor Green
                }
                Write-Host '  API health: http://<same-address>:5000/api/heartbeat'
                Write-Host 'If the link does not open from another device, allow ports 5173 and 5000 through Windows Firewall.'
            }
            $lastAddressList = $addressList
        }

        Start-Sleep -Seconds 5
    }
} catch {
    Write-Host "`nPOS could not start: $($_.Exception.Message)" -ForegroundColor Red
}