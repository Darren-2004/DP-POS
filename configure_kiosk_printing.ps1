param(
    [Parameter(Mandatory = $true)]
    [string]$ProfileDir
)

$ErrorActionPreference = 'Stop'
$profilePattern = [regex]::Escape($ProfileDir)
$kioskProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -in @('chrome.exe', 'msedge.exe') -and $_.CommandLine -match $profilePattern
}
foreach ($process in $kioskProcesses) {
    Stop-Process -Id $process.ProcessId -Force
}

$preferencesPath = Join-Path $ProfileDir 'Default\Preferences'
$preferencesDirectory = Split-Path -Parent $preferencesPath
New-Item -ItemType Directory -Path $preferencesDirectory -Force | Out-Null

if (Test-Path $preferencesPath) {
    $preferences = Get-Content $preferencesPath -Raw | ConvertFrom-Json
} else {
    $preferences = [pscustomobject]@{}
}

if (-not $preferences.PSObject.Properties['printing']) {
    $preferences | Add-Member -NotePropertyName printing -NotePropertyValue ([pscustomobject]@{})
}
$printing = $preferences.printing
if (-not $printing.PSObject.Properties['print_preview_sticky_settings']) {
    $printing | Add-Member -NotePropertyName print_preview_sticky_settings -NotePropertyValue ([pscustomobject]@{})
}
$stickySettings = $printing.print_preview_sticky_settings

if ($stickySettings.PSObject.Properties['appState'] -and $stickySettings.appState) {
    $appState = $stickySettings.appState | ConvertFrom-Json
} else {
    $appState = [pscustomobject]@{ version = 2 }
}

if ($appState.PSObject.Properties['isHeaderFooterEnabled']) {
    $appState.isHeaderFooterEnabled = $false
} else {
    $appState | Add-Member -NotePropertyName isHeaderFooterEnabled -NotePropertyValue $false
}

$serializedAppState = ConvertTo-Json $appState -Compress -Depth 50
if ($stickySettings.PSObject.Properties['appState']) {
    $stickySettings.appState = $serializedAppState
} else {
    $stickySettings | Add-Member -NotePropertyName appState -NotePropertyValue $serializedAppState
}
$json = ConvertTo-Json $preferences -Compress -Depth 100
[System.IO.File]::WriteAllText($preferencesPath, $json, [System.Text.UTF8Encoding]::new($false))