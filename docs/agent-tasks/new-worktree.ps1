# Creates an isolated working copy for one agent task, so several agents can work at the same time without
# switching branches in (and breaking) each other's files or the main checkout's dev server.
#
#   powershell -ExecutionPolicy Bypass -File docs\agent-tasks\new-worktree.ps1 -Task T3 -Branch feature/hud-radar -Port 5303
#
# - The worktree is created next to the repo:  <repo>\..\cosmohaven-wt\<Task>
# - It starts from the current `master` (tested: lint runs inside the worktree)
# - node_modules is a junction to the main checkout's (no reinstall). If a task changes dependencies, run `npm ci`
#   inside the worktree instead (delete the junction first: `cmd /c rmdir node_modules`).
# - Give every agent its OWN dev-server port (-Port) so servers do not collide.
# - To remove a worktree later, unlink node_modules FIRST (git cannot delete the junction); the script prints the commands.
param(
  [Parameter(Mandatory = $true)][string]$Task,
  [Parameter(Mandatory = $true)][string]$Branch,
  [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
$repo = (git rev-parse --show-toplevel).Trim() -replace '/', '\'
$root = Join-Path (Split-Path $repo -Parent) 'cosmohaven-wt'
$path = Join-Path $root $Task

if (Test-Path $path) { throw "Worktree already exists: $path" }
New-Item -ItemType Directory -Force -Path $root | Out-Null

git -C $repo worktree add $path -b $Branch master
if ($LASTEXITCODE -ne 0) { throw 'git worktree add failed' }

cmd /c mklink /J "$path\node_modules" "$repo\node_modules" | Out-Null
if (-not (Test-Path "$path\node_modules")) { throw 'Could not link node_modules' }

$modules = Join-Path $path 'node_modules'
Write-Host ''
Write-Host "Worktree ready: $path   (branch $Branch, from master)"
Write-Host "Agent working directory: $path"
if ($Port -gt 0) { Write-Host "Dev server: npx vite --port $Port --strictPort   (use this port only)" }
Write-Host 'When the task is merged (unlink node_modules FIRST, or git cannot delete the folder):'
Write-Host "  cmd /c rmdir `"$modules`""
Write-Host "  git worktree remove --force `"$path`""
Write-Host "  git branch -d $Branch"
