# sync-repo.ps1 — Run this before starting work on any device
# Usage: .\scripts\sync-repo.ps1

Write-Host "`n=== Syncing repo ===" -ForegroundColor Cyan

# Save any uncommitted work
$status = git status --porcelain
if ($status) {
    Write-Host "Stashing uncommitted changes..." -ForegroundColor Yellow
    git stash push -m "auto-stash before sync"
    $stashed = $true
} else {
    $stashed = $false
}

# 1. Pull latest main from origin
Write-Host "`n[1/4] Pulling latest main from origin..." -ForegroundColor Green
git checkout main
git pull origin main --rebase
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to pull main. Resolve conflicts and retry." -ForegroundColor Red
    exit 1
}

# 2. Update core-main from core remote
Write-Host "`n[2/4] Updating core-main from core remote..." -ForegroundColor Green
git checkout core-main
git pull core main
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to pull core-main. Resolve conflicts and retry." -ForegroundColor Red
    exit 1
}

# 3. Rebase main onto updated core-main
Write-Host "`n[3/4] Rebasing main onto core-main..." -ForegroundColor Green
git checkout main
git rebase core-main
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Rebase conflict. Resolve manually, then run:" -ForegroundColor Red
    Write-Host "  git rebase --continue" -ForegroundColor Yellow
    Write-Host "  git push origin main --force-with-lease" -ForegroundColor Yellow
    exit 1
}

# 4. Push rebased main
Write-Host "`n[4/4] Pushing main to origin..." -ForegroundColor Green
git push origin main --force-with-lease
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Push failed." -ForegroundColor Red
    exit 1
}

# Restore stashed changes if any
if ($stashed) {
    Write-Host "`nRestoring stashed changes..." -ForegroundColor Yellow
    git stash pop
}

Write-Host "`n=== Sync complete! Ready to work. ===" -ForegroundColor Cyan
