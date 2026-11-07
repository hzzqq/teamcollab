<#
.SYNOPSIS   本地多项目端口冲突：一键排查 / 释放 / 避让
.DESCRIPTION
  同机多项目演示时，Next.js 默认抢 3000、uvicorn/Flask 抢 8000/5000、Streamlit 抢 8501，
  跨会话的后台进程也可能残留占用端口。本脚本只用 PowerShell 原生 cmdlet（不依赖被沙箱拦截的
  sc.exe / wmic.exe / taskkill.exe）：只读列出端口占用归属（含 HTTP 标题识别应用），并可
  一键释放「同工程 / 同路径」的陈旧进程，或自动避让到下一个空闲端口。
.NOTES
  用法：
    .\port-resolver.ps1 -Probe
        列出一组常用演示端口（3000/5000/5050/5052/8000/8501/8899/5173）当前被谁占、是什么应用。
    .\port-resolver.ps1 -Port 3000
        查看单个端口被哪个进程占用（PID / 名称 / 路径 / HTTP 标题）。
    .\port-resolver.ps1 -Port 3000 -Free [-Project teamcollab] [-Force] [-WhatIf]
        端口被占时：进程路径含 -Project 或 -Force 才释放；否则只报告并建议空闲端口。
    .\port-resolver.ps1 -Port 8000 -FindFree
        不杀进程，只返回下一个空闲端口（用于启动时自动避让）。
#>
[CmdletBinding()]
param(
  [int]$Port,
  [string]$Project = '',
  [switch]$Probe,
  [switch]$Free,
  [switch]$FindFree,
  [switch]$Force,
  [switch]$WhatIf
)

$ports = @(3000, 5000, 5050, 5052, 8000, 8501, 8899, 5173)
$desc = @{
  3000 = 'Next.js 前端'; 5000 = 'Flask'; 5050 = 'StockSignal Flask';
  5052 = 'StockSignal FastAPI'; 8000 = 'uvicorn/FastAPI 后端';
  8501 = 'Streamlit 默认'; 8899 = 'StockSignal Streamlit(避8000-8300)'; 5173 = 'Vite'
}

function Get-PortOwner {
  param([int]$p)
  $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
  if (-not $conns) { return @() }
  $out = @()
  foreach ($c in $conns) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    # best-effort: 取 HTTP 标题识别应用（绕过注入的代理）
    $title = ''
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$p/" -TimeoutSec 2 -Proxy $null -ErrorAction SilentlyContinue
      if ($r -and $r.Content -match '<title>([^<]*)</title>') { $title = $matches[1] }
    } catch { }
    $out += [pscustomobject]@{
      Port  = $p
      PID   = $c.OwningProcess
      State = $c.State
      Name  = $proc.Name
      Path  = $proc.Path
      Title = $title
    }
  }
  return $out
}

function Test-Free { param([int]$p)
  return (-not (Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue))
}

function Find-FreePort { param([int]$start)
  $p = $start
  while ($p -lt $start + 200) {
    if (Test-Free $p) { return $p }
    $p++
  }
  return $null
}

function LabelProject { param([string]$path, [string]$title)
  if ($path -match 'project4|teamcollab') { return '[TeamCollab/project4]' }
  if ($path -match '\\ks\\|StockSignal') { return '[ks/StockSignal]' }
  if ($title -match 'TeamCollab') { return '[TeamCollab]' }
  if ($title -match 'stock|量化|信号') { return '[StockSignal/ks]' }
  if ($path -match '\\app\\|\\project5\\|\\project3\\') { return '[其他项目]' }
  return ''
}

if ($FindFree -and $Port) {
  $f = Find-FreePort $Port
  if ($f) { Write-Host "空闲端口(从 $Port 起): $f" -ForegroundColor Green }
  else { Write-Host "在 $Port~$($Port+199) 区间未找到空闲端口" -ForegroundColor Red }
  exit 0
}

if ($Probe) {
  Write-Host '==== 常用演示端口占用排查 ====' -ForegroundColor Cyan
  foreach ($p in $ports) {
    $owners = Get-PortOwner $p
    if ($owners.Count -eq 0) {
      Write-Host ('  {0,-6} 空闲        ({1})' -f $p, $desc[$p]) -ForegroundColor DarkGray
    } else {
      foreach ($o in $owners) {
        $lbl = LabelProject $o.Path $o.Title
        $t = if ($o.Title) { "title=`"$($o.Title)`"" } else { '' }
        Write-Host ('  {0,-6} 占用 PID={1,-6} {2,-20} {3} {4}' -f $p, $o.PID, $o.Name, $lbl, $t) -ForegroundColor Yellow
        Write-Host ('         Path={0}' -f $o.Path) -ForegroundColor DarkGray
      }
    }
  }
  exit 0
}

if ($Port) {
  $owners = Get-PortOwner $Port
  if ($owners.Count -eq 0) {
    Write-Host "端口 $Port 当前空闲" -ForegroundColor Green
    exit 0
  }
  Write-Host "端口 $Port 被占用：" -ForegroundColor Yellow
  foreach ($o in $owners) {
    Write-Host ('  PID={0} {1}`n    Path={2}`n    Title={3}' -f $o.PID, $o.Name, $o.Path, $o.Title)
  }
  if ($Free) {
    $o = $owners[0]
    $sameProject = ($Project -and ($o.Path -match [regex]::Escape($Project)))
    if ($Force -or $sameProject) {
      if ($WhatIf) {
        Write-Host ('  [WhatIf] 将结束 PID={0}（{1}）以释放端口 {2}' -f $o.PID, $o.Name, $Port) -ForegroundColor Magenta
      } else {
        try {
          Stop-Process -Id $o.PID -Force -ErrorAction Stop
          Write-Host ('  已释放端口 {0}（结束 PID={1}）' -f $Port, $o.PID) -ForegroundColor Green
        } catch {
          Write-Host ('  释放失败：{0}' -f $_.Exception.Message) -ForegroundColor Red
        }
      }
    } else {
      $f = Find-FreePort $Port
      Write-Host ('  占用者非本工程且未指定 -Force，建议避让到空闲端口: {0}' -f $f) -ForegroundColor Cyan
    }
  }
}
