$workDir  = "C:\Users\julio\Documents\github\crypto-scanner"
$claudeExe = "C:\Users\julio\.local\bin\claude.exe"
$logDir   = "$workDir\backend\logs"
$logFile  = "$logDir\leader-$(Get-Date -Format 'yyyyMMdd-HHmm').log"

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

function Log($msg) {
    $line = "$(Get-Date -Format 'HH:mm:ss') $msg"
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

Log "=== Leader Review iniciado ==="

# Abort if backend is offline — leader cannot operate without it
try {
    $null = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -TimeoutSec 5
    Log "Backend OK"
} catch {
    Log "ERRO: Backend offline. Suba com 'npm run server' e tente novamente."
    exit 1
}

Set-Location $workDir

# --dangerously-skip-permissions: bypasses all tool permission prompts (safe for local-only agent)
# --agent leader: loads .claude/agents/leader.md as the session agent
# $null piped to stdin: prevents claude from waiting for TTY input in Task Scheduler context
Log "Invocando agente Leader..."
$null | & $claudeExe --dangerously-skip-permissions --print --agent leader "rode o Leader pra revisar" 2>&1 |
    Tee-Object -Encoding utf8 -FilePath $logFile -Append

Log "=== Leader Review concluído. Log: $logFile ==="
