# Clean up old GitHub releases
param(
    [int]$KeepLatest = 3,
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

Write-Host "Fetching releases..." -ForegroundColor Cyan

$releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases?per_page=100" -Headers $headers

Write-Host "Found $($releases.Count) releases" -ForegroundColor Green

if ($releases.Count -le $KeepLatest) {
    Write-Host "Only $($releases.Count) releases. Keeping all." -ForegroundColor Yellow
    exit 0
}

$toDelete = $releases | Sort-Object -Property created_at -Descending | Select-Object -Skip $KeepLatest

Write-Host "`nWill DELETE $($toDelete.Count) releases (keeping $KeepLatest):" -ForegroundColor Yellow
foreach ($r in $toDelete) {
    Write-Host "  - $($r.tag_name)" -ForegroundColor Gray
}

$confirm = Read-Host "`nProceed? (y/N)"
if ($confirm -ne 'y') {
    Write-Host "Cancelled" -ForegroundColor Yellow
    exit 0
}

foreach ($r in $toDelete) {
    Write-Host "`nDeleting $($r.tag_name)..." -ForegroundColor Cyan
    
    try {
        Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/$($r.id)" -Method Delete -Headers $headers | Out-Null
        Write-Host "  Release deleted" -ForegroundColor Green
    }
    catch {
        Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    try {
        Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/git/refs/tags/$($r.tag_name)" -Method Delete -Headers $headers | Out-Null
        Write-Host "  Tag deleted" -ForegroundColor Green
    }
    catch {
        Write-Host "  Tag delete failed" -ForegroundColor Yellow
    }
}

Write-Host "`nDone!" -ForegroundColor Green
