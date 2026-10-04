# Creates an isolated working copy for one agent task, so several agents can work at the same time without
# switching branches in (and breaking) each other's files or the main checkout's dev server.
#
#   powershell -ExecutionPolicy Bypass -File docs\agent-tasks\new-worktree.ps1 -Task T3 -Branch feature/hud-radar -Port 5303
#
# - The worktree is created next to the repo:  <repo>\..\cosmohaven-wt\<Task>
# - It starts from the current `master`
# - It gets its OWN node_modules via `npm ci` (about 40 s). DO NOT share node_modules between checkouts with a
#   junction/symlink: `git worktree remove` follows the link and deletes the real files (this happened once and had to
#   be repaired with `npm ci`).
# - Give every agent its OWN dev-server port (-Port) so servers do not collide.
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

Push-Location $path
try {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
} finally {
  Pop-Location
}

Write-Host ''
Write-Host "Worktree ready: $path   (branch $Branch, from master)"
Write-Host "Agent working directory: $path"
if ($Port -gt 0) { Write-Host "Dev server: npx vite --port $Port --strictPort   (use this port only)" }
Write-Host 'When the task is merged:'
Write-Host "  git worktree remove --force `"$path`""
Write-Host "  git branch -d $Branch"
