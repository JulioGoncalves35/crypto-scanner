$ErrorActionPreference = "Continue"
$root = "C:\Users\julio\Documents\github\crypto-scanner\agents-v2"
$logDir = "$root\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = "$logDir\council_$(Get-Date -Format yyyy-MM-dd).log"
Set-Location $root
"=== run @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -FilePath $log -Append
python run_council.py --live *>> $log
