$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$releaseDirectory = Join-Path $projectDirectory 'release'
$stagingDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("POSPrintAgent-" + [guid]::NewGuid())
$packageDirectory = Join-Path $stagingDirectory 'POSPrintAgent'
$packageAgentDirectory = Join-Path $packageDirectory 'app'
$archivePath = Join-Path $releaseDirectory 'POSPrintAgent-Windows.zip'

New-Item -ItemType Directory -Path $packageAgentDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
Copy-Item (Join-Path $projectDirectory 'install_print_agent.ps1') $packageDirectory
Copy-Item (Join-Path $projectDirectory 'requirements-agent.txt') $packageDirectory
Copy-Item (Join-Path $projectDirectory 'Lancer_Caisse.bat') $packageDirectory
Copy-Item (Join-Path $projectDirectory 'configure_kiosk_printing.ps1') $packageDirectory
Copy-Item (Join-Path $projectDirectory 'app\print_agent.py') $packageAgentDirectory
Compress-Archive -Path (Join-Path $packageDirectory '*') -DestinationPath $archivePath -Force
Remove-Item -LiteralPath $stagingDirectory -Recurse -Force

Write-Host "Created standalone Windows print-agent package: $archivePath"
Write-Host 'Copy this ZIP to each cashier PC and extract it. Run install_print_agent.ps1 for printing, then run Lancer_Caisse.bat and enter the server POS URL to open kiosk Chrome.'