# Build the workspace Docker image used by OpenCode Cloud Agent
# Default tag matches the WORKSPACE_IMAGE default in src/config/app.config.ts
param(
  [string]$Tag = "opencode-cloud-agent/workspace:latest"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dockerfile = Join-Path $ScriptDir "opencode-workspace.Dockerfile"

Write-Host "Building workspace image as '$Tag'..." -ForegroundColor Cyan
docker build -t $Tag -f $Dockerfile $ScriptDir

if ($LASTEXITCODE -eq 0) {
  Write-Host "`n✓ Image built: $Tag" -ForegroundColor Green
  Write-Host "Update .env with: WORKSPACE_IMAGE=$Tag" -ForegroundColor Yellow
} else {
  Write-Host "`n✗ Build failed" -ForegroundColor Red
  exit 1
}
