# Clean up old GitHub Actions workflow runs
param(
    [int]$KeepLatest = 10,
    [string]$Token = $env:GITHUB_TOKEN
)

$owner = "Veno89"
$repo = "Vplayer"

if (-not $Token) {
    Write-Host "ERROR: GITHUB_TOKEN not set!" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $Token"
    "Accept"        = "application/vnd.github+json"
}

Write-Host "Fetching workflow runs..." -ForegroundColor Cyan

# GitHub API limits per_page to 100.
$runsResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/actions/runs?per_page=100" -Headers $headers
$runs = $runsResponse.workflow_runs

Write-Host "Found $($runs.Count) workflow runs in the most recent page" -ForegroundColor Green

if ($runs.Count -le $KeepLatest) {
    Write-Host "Only $($runs.Count) workflow runs found. Keeping all." -ForegroundColor Yellow
    exit 0
}

# Sort by created_at descending just to be safe
$toDelete = $runs | Sort-Object -Property created_at -Descending | Select-Object -Skip $KeepLatest

Write-Host "`nWill DELETE $($toDelete.Count) workflow runs (keeping $KeepLatest latest):" -ForegroundColor Yellow

$confirm = Read-Host "`nProceed? (y/N)"
if ($confirm -ne 'y') {
    Write-Host "Cancelled" -ForegroundColor Yellow
    exit 0
}

foreach ($r in $toDelete) {
    Write-Host "`nDeleting Workflow Run $($r.id) ($($r.name) - $($r.head_commit.message.Split("`n")[0]))..." -ForegroundColor Cyan
    
    try {
        Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/actions/runs/$($r.id)" -Method Delete -Headers $headers | Out-Null
        Write-Host "  Workflow run deleted" -ForegroundColor Green
    }
    catch {
        Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nDone!" -ForegroundColor Green
