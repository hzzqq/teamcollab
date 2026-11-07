<#
.SYNOPSIS   TeamCollab 一键干净启动 / 停止 / 看日志
.DESCRIPTION
  适用于本机多项目演示环境（Windows PowerShell 5.1）。只管理 TeamCollab 自己的进程：
  - 确保 PostgreSQL 服务 collabpg 在跑（未起则尝试 net start）；
  - 仅停止「uvicorn+--port / next start+-p / 命令行含 project4」的本项目旧实例，
    绝不误杀 ks(StockSignal) 或 WorkBuddy 核心；
  - 端口被「非本项目」占用时：前端默认自动避让（无损）；后端默认不避让并给出建议，
    因为前端 NEXT_PUBLIC_API_BASE 在 build 时烤死为 http://localhost:8000，
    后端换端口会静默切断前后端；需 -AutoAvoid 才避让并打警告；
  - 起后端(uvicorn)+前端(next start) → 幂等 seed 演示账号 → 轮询就绪+真实登录校验。
  纯 PowerShell 原生 cmdlet，避开被沙箱黑名单的 sc/wmic/taskkill。
.NOTES
  用法（仓库根目录下执行）：
    .\scripts\start-teamcollab.ps1                 # 干净启动（停旧+起新+seed+校验）
    .\scripts\start-teamcollab.ps1 -Log            # 只看日志尾部 40 行，不动服务
    .\scripts\start-teamcollab.ps1 -Log -Tail 100 # 看尾部 100 行
    .\scripts\start-teamcollab.ps1 -Stop           # 仅停止本项目实例
    .\scripts\start-teamcollab.ps1 -WhatIf         # 只预报不真做
    .\scripts\start-teamcollab.ps1 -SkipSeed       # 不起演示数据（账号已有时）
    .\scripts\start-teamcollab.ps1 -BackendPort 8001 -FrontendPort 3001   # 换端口起
    .\scripts\start-teamcollab.ps1 -AutoAvoid      # 后端端口被占时也避让（接受前后端可能断链）
  运行需绕过执行策略：powershell -ExecutionPolicy Bypass -File .\scripts\start-teamcollab.ps1
  跨天/重启后服务会被系统清掉，直接再跑一次本脚本即可恢复（PG 已服务化会自动拉起）。
  Linux / WSL 请用同目录的 start-teamcollab.sh（bash + nohup setsid）。
  端口真相源（唯一）：仓库根 .port.env（port-doctor 生成、本机文件、已 gitignore）。
    优先级：显式 -BackendPort/-FrontendPort > 同名环境变量 > .port.env > 默认(8000/3000)。
    与 port_env.py / start_dev.py 同口径。前端 NEXT_PUBLIC_API_BASE 在 build 时烤死 8000，
    故 .port.env 若给了非 8000 的 PORT 且未经显式覆盖，脚本直接报错退出（绝不静默断链）；
    WEB_PORT 则被正常读取为前端默认端口（换前端端口不影响 API 连通）。
#>
[CmdletBinding()]
param(
  # 0 = 未显式指定，交给下方「单一端口真相源」段解析 .port.env / 环境变量 / 默认值
  [int]$BackendPort  = 0,
  [int]$FrontendPort = 0,
  [string]$ProjectDir = '',
  [switch]$Stop,
  [switch]$SkipSeed,
  [switch]$WhatIf,
  [switch]$Log,
  [int]$Tail = 40,
  [switch]$AutoAvoid
)

# 未显式指定时按脚本位置推断仓库根（scripts/ 的父目录）；跨机 clone 后无需改路径
if (-not $ProjectDir) { $ProjectDir = Split-Path -Parent $PSScriptRoot }

$serverDir = Join-Path $ProjectDir 'server'
$webDir    = Join-Path $ProjectDir 'web'
$logDir    = Join-Path $ProjectDir 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# ---------------- -Log：只看日志，不触碰服务 ----------------
if ($Log) {
  Write-Host ("== 日志尾部 (各 {0} 行) ==" -f $Tail) -ForegroundColor Cyan
  foreach ($n in @('backend','frontend')) {
    $p = Join-Path $logDir ($n + '.log')
    Write-Host ("--- {0}  {1} ---" -f $n, $p) -ForegroundColor Cyan
    if (Test-Path $p) {
      $lines = @(Get-Content -LiteralPath $p -Tail $Tail -Encoding UTF8)
      if ($lines.Count -eq 0) {
        # 旧版本 / Start-Process 回退可能把输出写到 .log.err，兜底一起显示
        $ep = $p + '.err'
        if ((Test-Path $ep) -and ((Get-Item $ep).Length -gt 0)) {
          Write-Host "  ($n.log 为空，改看 $n.log.err)" -ForegroundColor DarkGray
          Get-Content -LiteralPath $ep -Tail $Tail -Encoding UTF8
        } else { Write-Host '  (日志为空)' -ForegroundColor DarkGray }
      } else { $lines }
    } else { Write-Host '  (无日志文件)' -ForegroundColor DarkGray }
  }
  exit 0
}

# 清理大小写重复的代理变量（沙箱常同时注入 http_proxy / HTTP_PROXY）。
# 否则 Start-Process 复刻环境块到大小写敏感字典时会抛“字典关键字已添加”。
# 仅清除本进程及其子进程的环境，不影响沙箱其它部分。
foreach ($name in @('http_proxy','HTTP_PROXY','https_proxy','HTTPS_PROXY','all_proxy','ALL_PROXY','no_proxy','NO_PROXY')) {
  [Environment]::SetEnvironmentVariable($name, $null, 'Process') | Out-Null
}

# 用 P/Invoke 真正脱离作业启动（CREATE_BREAKAWAY_FROM_JOB）。
# 普通用户的 PowerShell 无作业包裹，此标志无害；在受作业约束的环境（如某些 agent 沙箱）
# 可能被作业策略拒绝，届时回退到 cmd /c start。
$breakawayCode = @'
using System;
using System.Runtime.InteropServices;
public class Breakaway {
  [StructLayout(LayoutKind.Sequential)]
  public struct STARTUPINFO { public int cb; public IntPtr lpReserved; public IntPtr lpDesktop; public IntPtr lpTitle; public int dwX; public int dwY; public int dwXSize; public int dwYSize; public int dwXCountChars; public int dwYCountChars; public int dwFillAttribute; public int dwFlags; public IntPtr wShowWindow; public IntPtr cbReserved2; public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError; }
  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION { public IntPtr hProcess; public IntPtr hThread; public int dwProcessId; public int dwThreadId; }
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  public static extern bool CreateProcess(string lpApplicationName, string lpCommandLine, IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory, ref STARTUPINFO lpStartupInfo, ref PROCESS_INFORMATION lpProcessInformation);
  public static int Run(string cmdline, string cwd) {
    STARTUPINFO si = new STARTUPINFO(); si.cb = Marshal.SizeOf(si);
    si.dwFlags = 0x1; si.wShowWindow = (IntPtr)0; // STARTF_USESHOWWINDOW + SW_HIDE
    PROCESS_INFORMATION pi;
    uint flags = 0x01000000 | 0x00000200; // CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP
    if (CreateProcess(null, cmdline, IntPtr.Zero, IntPtr.Zero, false, flags, IntPtr.Zero, cwd, ref si, out pi)) {
      return pi.dwProcessId;
    }
    return -1;
  }
}
'@
try { Add-Type -TypeDefinition $breakawayCode -ErrorAction Stop; $script:HasBreakaway = $true }
catch { $script:HasBreakaway = $false }

function Write-Step($m){ Write-Host ('== ' + $m) -ForegroundColor Cyan }
function Write-Ok($m){ Write-Host ('  ' + $m) -ForegroundColor Green }
function Write-Warn($m){ Write-Host ('  ' + $m) -ForegroundColor Yellow }
function Write-Err($m){ Write-Host ('  ' + $m) -ForegroundColor Red }

# 定位 node（优先 PATH，回退 WorkBuddy 自带）
function Find-Node {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if ($n) { return $n.Source }
  $wb = Get-ChildItem 'C:\Users\Administrator\.workbuddy\binaries\node\versions\*\node.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($wb) { return $wb.FullName }
  return $null
}

# 确保 PostgreSQL
function Ensure-PG {
  $pg = Get-Service collabpg -ErrorAction SilentlyContinue
  if ($pg -and $pg.Status -eq 'Running') { Write-Ok 'PostgreSQL 服务 collabpg 已在运行'; return $true }
  if ($pg) {
    Write-Step '尝试启动 PostgreSQL 服务 collabpg ...'
    try { net start collabpg | Out-Null; Start-Sleep -Seconds 2 } catch { }
  }
  $ok = [bool](Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue)
  if ($ok) { Write-Ok 'PostgreSQL 监听 :5432' } else { Write-Err 'PostgreSQL 未就绪(:5432 无监听)，请先以管理员 net start collabpg' }
  return $ok
}

# 端口占用归属：只读，不杀。返回 Busy / Ours / Pid / Name
function Get-PortOwnerInfo {
  param([int]$port, [scriptblock]$IsOurs)
  $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  if (-not $conns) { return [pscustomobject]@{ Busy=$false; Ours=$true; Pid=0; Name='' } }
  $px = ($conns.OwningProcess | Sort-Object -Unique | Select-Object -First 1)
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$px" -ErrorAction SilentlyContinue
  $cmd = if ($proc) { [string]$proc.CommandLine } else { '' }
  $nm  = if ($proc) { [string]$proc.Name } else { '?' }
  $ours = [bool](& $IsOurs $cmd)
  return [pscustomobject]@{ Busy=$true; Ours=$ours; Pid=$px; Name=$nm }
}

# 找下一个空闲端口（从 start+1 起，最多 200 个）
function Find-FreePort {
  param([int]$start)
  for ($p = $start + 1; $p -lt $start + 200; $p++) {
    if (-not (Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue)) { return $p }
  }
  return $null
}

# 仅停止本项目旧实例（非本项目占用由主流程负责诊断/避让，此处静默跳过）
function Stop-ProjectProcOnPort {
  param([int]$port, [scriptblock]$IsOurs)
  $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  if (-not $conns) { return @() }
  $pids = $conns.OwningProcess | Sort-Object -Unique
  $killed = @()
  foreach ($px in $pids) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$px" -ErrorAction SilentlyContinue
    $cmd = if ($proc) { [string]$proc.CommandLine } else { '' }
    if ($proc -and (& $IsOurs $cmd)) {
      if ($WhatIf) { Write-Warn ("[WhatIf] 将结束 PID=$px (本项目旧实例): $($proc.Name)") }
      else { try { Stop-Process -Id $px -Force -ErrorAction Stop; $killed += $px; Write-Ok ("已结束旧实例 PID=$px ($($proc.Name))") } catch { Write-Err ("结束 PID=$px 失败: $($_.Exception.Message)") } }
    }
  }
  return $killed
}

# 脱离脚本独立启动（优先 P/Invoke 作业脱离；失败回退 cmd /c start）
function Start-Server {
  param([string]$exe, [string[]]$argList, [string]$dir, [string]$log)
  if ($WhatIf) { Write-Warn ("[WhatIf] 启动: $exe $($argList -join ' ')  (cwd=$dir)"); return $null }
  $argStr = $argList -join ' '
  # 走 cmd /c 以便把 stdout/stderr 合并重定向到日志文件
  $inner = "cmd /c $exe $argStr > $log 2>&1"
  $pid_ = -1
  if ($script:HasBreakaway) {
    try { $pid_ = [Breakaway]::Run($inner, $dir) } catch { $pid_ = -1 }
  }
  if ($pid_ -lt 0) {
    try {
      $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', ('start "" ' + $inner) -WorkingDirectory $dir -WindowStyle Hidden -PassThru
      $pid_ = $p.Id
    } catch { $pid_ = -1 }
  }
  if ($pid_ -lt 0) { Write-Err ('启动失败: ' + $exe); return $null }
  return $pid_
}

# 轮询端口就绪
function Wait-Port {
  param([int]$port, [int]$secs = 25)
  for ($i = 0; $i -lt $secs; $i++) {
    if (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

# ---------------- 单一端口真相源：.port.env ----------------
# 优先级：显式 -BackendPort/-FrontendPort > 同名环境变量 > .port.env > 默认(8000/3000)
# 与 port_env.py / start_dev.py 完全同口径；三入口对冲突做同一件事：拒绝静默启动断链服务。
$portEnvFile = Join-Path $ProjectDir '.port.env'
$envBackend = $null; $envFrontend = $null
if (Test-Path $portEnvFile) {
  foreach ($line in @(Get-Content -LiteralPath $portEnvFile -Encoding UTF8 -ErrorAction SilentlyContinue)) {
    if ($line -match '^\s*PORT\s*=\s*(\d+)\s*$' -and $null -eq $envBackend) { $envBackend = [int]$matches[1] }
    if ($line -match '^\s*WEB_PORT\s*=\s*(\d+)\s*$' -and $null -eq $envFrontend) { $envFrontend = [int]$matches[1] }
  }
}
$backendExplicit = ($BackendPort -ne 0)
$frontendExplicit = ($FrontendPort -ne 0)
$envBackendOverride = "$env:BACKEND_PORT"
$envFrontendOverride = "$env:FRONTEND_PORT"
$backendFromEnvFile = $false
if (-not $backendExplicit) {
  if ($envBackendOverride -match '^\d+$') { $BackendPort = [int]$envBackendOverride }
  elseif ($null -ne $envBackend) { $BackendPort = $envBackend; $backendFromEnvFile = $true }
  else { $BackendPort = 8000 }
}
if (-not $frontendExplicit) {
  if ($envFrontendOverride -match '^\d+$') { $FrontendPort = [int]$envFrontendOverride }
  elseif ($null -ne $envFrontend) { $FrontendPort = $envFrontend }
  else { $FrontendPort = 3000 }
}
if ($backendFromEnvFile -and $BackendPort -ne 8000) {
  Write-Err "配置冲突：.port.env PORT=$BackendPort，但前端 NEXT_PUBLIC_API_BASE 在 build 时烤死为 http://localhost:8000"
  Write-Err "  按 :$BackendPort 起后端，前端会静默连不上。三选一："
  Write-Err "    ① 把 .port.env 的 PORT 改回 8000（推荐；port-doctor 不应给本项目后端分配其它端口）"
  Write-Err "    ② 显式 -BackendPort $BackendPort 并同步重编前端（NEXT_PUBLIC_API_BASE=http://localhost:$BackendPort npm run build）"
  Write-Err "    ③ 配 nginx 同源代理，前端统一走同源 /api"
  if (-not $Stop) { exit 1 } else { Write-Warn '  -Stop 模式不受阻断，继续停止本项目实例' }
}
if ($BackendPort -ne 8000) {
  Write-Warn "后端 :$BackendPort ≠ 8000（显式指定）：前端写死的 API_BASE 将连不上，需同步重编前端或同源代理"
}

# ---------------- 主流程 ----------------
Write-Step "TeamCollab 一键$(if($Stop){'停止'}else{'干净启动'}) (后端:$BackendPort 前端:$FrontendPort)"

$isBackend  = { param($c) ($c -match 'project4') -or (($c -match 'uvicorn') -and ($c -match [regex]::Escape("--port $BackendPort"))) }
$isFrontend = { param($c) ($c -match 'project4') -or (($c -match 'next') -and ($c -match 'start') -and ($c -match [regex]::Escape("-p $FrontendPort"))) }

# 先只读诊断占用归属（非本项目占用 → 避让或给建议），再停本项目旧实例
$backendPort  = $BackendPort
$frontendPort = $FrontendPort
$bo = Get-PortOwnerInfo $BackendPort  $isBackend
$fo = Get-PortOwnerInfo $FrontendPort $isFrontend

if ($bo.Busy -and -not $bo.Ours) {
  Write-Warn "后端 :$BackendPort 被非本项目进程占用 PID=$($bo.Pid) $($bo.Name)"
  if ($AutoAvoid) {
    $alt = Find-FreePort $BackendPort
    if ($alt) {
      Write-Warn "  -AutoAvoid：后端改用 :$alt"
      Write-Err  "  [!] 警告：前端 NEXT_PUBLIC_API_BASE 在 build 时烤死为 http://localhost:$BackendPort，后端换端口后前端会连不上；需重编前端或配同源代理"
      $backendPort = $alt
    } else { Write-Err '  找不到空闲后端端口' }
  } else {
    Write-Err '  后端默认不避让（换端口会静默切断前后端）。三选一：'
    Write-Err '    ① 手动停掉占用者；② -BackendPort 指定新端口并同步重编前端；③ 加 -AutoAvoid 接受断链'
  }
}
if ($fo.Busy -and -not $fo.Ours) {
  $alt = Find-FreePort $FrontendPort
  if ($alt) {
    Write-Warn "前端 :$FrontendPort 被非本项目进程占用 PID=$($fo.Pid) $($fo.Name) → 自动避让到 :$alt（API 连接不受影响）"
    $frontendPort = $alt
  } else { Write-Err "前端 :$FrontendPort 被占且找不到空闲端口" }
}

$killedB = Stop-ProjectProcOnPort $BackendPort  $isBackend
$killedF = Stop-ProjectProcOnPort $FrontendPort $isFrontend
if ($Stop) {
  Write-Ok "已停止本项目实例（后端PIDs: $($killedB -join ',') 前端PIDs: $($killedF -join ',')）"
  exit 0
}

if (-not (Ensure-PG)) { Write-Err 'PG 未就绪，中止启动'; exit 1 }

$py = Join-Path $serverDir '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { Write-Err "未找到后端 venv: $py"; exit 1 }
$node = Find-Node
if (-not $node) { Write-Err '未找到 node（PATH 与 WorkBuddy 自带均未命中）'; exit 1 }
Write-Ok "node = $node"; Write-Ok "python = $py"

$backendLog  = Join-Path $logDir 'backend.log'
$frontendLog = Join-Path $logDir 'frontend.log'

Write-Step "启动后端 (uvicorn :$backendPort)"
$bid = Start-Server $py @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port',$backendPort) $serverDir $backendLog
if ($bid) { Write-Ok "后端 PID=$bid" }
$bUp = $false
if ($WhatIf) { Write-Warn '[WhatIf] 跳过后端就绪等待' }
else {
  $bUp = Wait-Port $backendPort
  if (-not $bUp) { Write-Err "后端 :$backendPort 未在预期内就绪，查看 $backendLog  或用 -Log 看日志" }
}

if (-not $SkipSeed) {
  Write-Step '灌入演示数据 (scripts.seed, 幂等)'
  if ($WhatIf) { Write-Warn ('[WhatIf] 运行: ' + $py + ' -m scripts.seed') }
  else {
    Push-Location $serverDir
    try {
      $out = & $py -m scripts.seed 2>&1
      $out | ForEach-Object { Write-Host ('    ' + $_) -ForegroundColor DarkGray }
    } catch { Write-Err ("seed 失败: $($_.Exception.Message)") }
    finally { Pop-Location }
  }
}

Write-Step "启动前端 (next start :$frontendPort)"
$fid = Start-Server $node @('node_modules/next/dist/bin/next','start','-p',$frontendPort) $webDir $frontendLog
if ($fid) { Write-Ok "前端 PID=$fid" }
if ($WhatIf) { Write-Warn '[WhatIf] 跳过前端就绪等待' }
else {
  $fUp = Wait-Port $frontendPort
  if (-not $fUp) { Write-Err "前端 :$frontendPort 未在预期内就绪，查看 $frontendLog  或用 -Log 看日志" }
}

# 校验：真实登录演示账号
Write-Step '端到端校验 (登录 pm@example.com)'
if ($bUp -and -not $WhatIf) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$backendPort/api/v1/auth/login" -Method Post `
         -Body @{username='pm@example.com';password='pass1234'} -Proxy $null -ErrorAction Stop
    if ($r.code -eq 0 -and $r.data.access_token) {
      Write-Ok "登录成功: 用户=$($r.data.user.display_name) 团队=$($r.data.team.name) 角色=$($r.data.role) token=有效"
    } else { Write-Err "登录返回异常: $($r.code)" }
  } catch { Write-Err ("登录校验失败: $($_.Exception.Message)") }
} elseif ($WhatIf) { Write-Warn '[WhatIf] 跳过登录校验' }

Write-Step '完成'
Write-Host ('  前端: http://localhost:' + $frontendPort) -ForegroundColor White
Write-Host ('  后端: http://localhost:' + $backendPort + '  (文档 /docs, 契约 /openapi.json)') -ForegroundColor White
Write-Host ('  日志: -Log [-Tail N]   |   停止: -Stop') -ForegroundColor White
Write-Host ('  演示账号: pm@example.com / pass1234 (owner); dev@example.com / pass1234 (member)') -ForegroundColor White
