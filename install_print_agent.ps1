$ErrorActionPreference = 'Stop'

$packageDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$agentScriptSource = Join-Path $packageDirectory 'app\print_agent.py'
$requirementsFile = Join-Path $packageDirectory 'requirements-agent.txt'
$pythonCommand = Get-Command python.exe -ErrorAction Stop
$pythonWindowless = Join-Path (Split-Path -Parent $pythonCommand.Source) 'pythonw.exe'
$pythonExecutable = if (Test-Path $pythonWindowless) { $pythonWindowless } else { $pythonCommand.Source }

if (-not (Test-Path $agentScriptSource)) {
    throw "Print agent not found: $agentScriptSource"
}
if (-not (Test-Path $requirementsFile)) {
    throw "Agent requirements not found: $requirementsFile"
}

Write-Host 'Available Windows printers:'
Get-Printer | Select-Object -ExpandProperty Name
Write-Host ''
$defaultPrinter = Get-CimInstance Win32_Printer | Where-Object Default | Select-Object -First 1
if (-not $defaultPrinter) {
    throw 'Set a Windows default printer before installing the POS print agent.'
}
Write-Host "Default printer for this PC: $($defaultPrinter.Name)"
Write-Host ''

$configDirectory = Join-Path $env:LOCALAPPDATA 'POSPrintAgent'
$configPath = Join-Path $configDirectory 'config.json'
$previousConfig = $null
if (Test-Path $configPath) {
    try {
        $previousConfig = Get-Content $configPath -Raw | ConvertFrom-Json
    } catch {
        throw 'The saved print-agent config is invalid. Back it up before reinstalling the agent.'
    }
}

$serverPrompt = if ($previousConfig.serverUrl) { "POS server URL [$($previousConfig.serverUrl)]" } else { 'POS server URL (example: http://172.20.10.5:5000)' }
$serverUrl = (Read-Host $serverPrompt).Trim().TrimEnd('/')
if (-not $serverUrl) { $serverUrl = $previousConfig.serverUrl }
$tokenPrompt = if ($previousConfig.agentToken) { 'Station token (press Enter to reuse this PC saved token)' } else { 'Station agent token' }
$agentToken = (Read-Host $tokenPrompt).Trim()
if (-not $agentToken) { $agentToken = $previousConfig.agentToken }

$serverUri = $null
if (-not [Uri]::TryCreate($serverUrl, [UriKind]::Absolute, [ref]$serverUri)) {
    throw 'Enter a valid absolute server URL.'
}
if ($serverUri.Scheme -notin @('http', 'https') -or -not $serverUri.Host) {
    throw 'Server URL must start with http:// or https:// and include a host.'
}

if (-not $serverUrl -or -not $agentToken) {
    throw 'Server URL and station token are required.'
}

Write-Host 'Installing print-agent dependencies...'
& $pythonCommand.Source -m pip install -r $requirementsFile
if ($LASTEXITCODE -ne 0) {
    throw 'Could not install print-agent dependencies.'
}

New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
$agentScript = Join-Path $configDirectory 'print_agent.py'
Copy-Item -Path $agentScriptSource -Destination $agentScript -Force
$config = [ordered]@{
    serverUrl = $serverUrl
    agentToken = $agentToken
}
$config | ConvertTo-Json | Set-Content -Path $configPath -Encoding utf8

$account = "$env:USERDOMAIN\$env:USERNAME"
& icacls.exe $configPath /inheritance:r /grant:r "${account}:(R,W)" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Could not restrict access to the station token configuration.'
}

$taskName = "POS_Print_Agent_$env:COMPUTERNAME"
$arguments = "`"$agentScript`" --config `"$configPath`""
$action = New-ScheduledTaskAction -Execute $pythonExecutable -Argument $arguments -WorkingDirectory $configDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Print agent installed for $($defaultPrinter.Name). It will start when $env:USERNAME logs in."
Write-Host "Configuration: $configPath"