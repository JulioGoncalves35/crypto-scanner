$workDir = "c:\Users\julio\Documents\github\crypto-scanner"
$claudeExe = "C:\Users\julio\.local\bin\claude.exe"
$logFile = "$workDir\logs\leader-$(Get-Date -Format 'yyyyMMdd-HHmm').log"

Set-Location $workDir

$prompt = @"
Rode o ciclo completo do agente Leader seguindo .claude/agents/leader.md:
Fase 1 - Reflexoes: leia os trades fechados recentemente via GET http://localhost:3001/api/trades, identifique os sem reflexao em GET http://localhost:3001/api/reflections, e escreva reflexoes via POST http://localhost:3001/api/reflections.
Fase 2 - Trades ativos: leia GET http://localhost:3001/api/trades/active e para cada um decida HOLD/EXIT/TIGHTEN. Nao execute acoes de exit/tighten diretamente — apenas liste os curls que o usuario deve rodar.
Fase 3 - Novos candidatos: chame POST http://localhost:3001/api/scan/preview para obter candidatos, rode o gate sequencial pattern-validator e news-hunter para cada candidato com score >= 85, e abra apenas os aprovados via POST http://localhost:3001/api/trades/open. Nunca chame /api/trades/open sem ambos os sub-agentes terem completado.
Backend: http://localhost:3001. Nunca passar coin com sufixo USDT no campo coin do body de /api/trades/open.
"@

# Pipe $null to stdin to avoid claude hanging waiting for stdin input in non-TTY contexts (e.g. Task Scheduler)
$null | & $claudeExe --dangerously-skip-permissions --print $prompt 2>&1 | Tee-Object -Encoding utf8 -FilePath $logFile

Write-Host "Log salvo em: $logFile"
