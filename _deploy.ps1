# Temporary deploy script. Token is read from .env in-process;
# it is never printed, never written to .git/config or commit history.
$ErrorActionPreference = 'Stop'

$vars = @{}
Get-Content .env | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
        $k, $v = $line -split '=', 2
        $vars[$k.Trim()] = $v.Trim()
    }
}
if (-not $vars['GITHUB_TOKEN']) { throw 'GITHUB_TOKEN not found in .env' }
$tok = $vars['GITHUB_TOKEN']

$owner = 'nwl01234'
$name  = 'business-flow-automator'
$uri   = 'https://api.github.com'
$hdr   = @{ Authorization = "Bearer $tok"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'bfa-deploy' }

# 1. create repo if missing
try {
    $repo = Invoke-RestMethod -Headers $hdr "$uri/repos/$owner/$name"
    Write-Output "repo exists: $($repo.full_name) (private=$($repo.private))"
} catch {
    $body = @{
        name        = $name
        description = 'Business process automation: orders via Telegram bot and web form, stock control (Google Sheets), audit log, notifications, real-time React dashboard. FastAPI + aiogram 3 + Docker'
        private     = $false
        has_issues  = $true
        auto_init   = $false
    } | ConvertTo-Json
    $repo = Invoke-RestMethod -Method Post -Headers $hdr -Uri "$uri/user/repos" -Body $body -ContentType 'application/json'
    Write-Output "repo created: $($repo.full_name)"
}

# 2. push directly using token (not stored in .git/config or remotes)
git push -q "https://$owner`:$tok@github.com/$owner/$name.git" 'HEAD:refs/heads/main'
if ($LASTEXITCODE -ne 0) { throw "git push failed: $LASTEXITCODE" }
Write-Output "pushed: main -> $owner/$name"

# 3. description + topics in English (ASCII only)
$desc = 'Automation toolkit: orders via Telegram bot & web form, stock control with Google Sheets sync, audit log (who/what/when/why), notifications, real-time React dashboard with WebSocket. FastAPI, aiogram 3, APScheduler, Docker'
$patch = @{ description = $desc; homepage = '' } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Headers $hdr -Uri "$uri/repos/$owner/$name" -Body $patch -ContentType 'application/json' | Out-Null

$topics = @{ names = @(
    'fastapi','python','react','websocket','tailwindcss','aiogram','telegram-bot',
    'google-sheets-api','apscheduler','docker','dashboard','automation','postgresql','sqlite','jwt','chartjs'
) } | ConvertTo-Json
Invoke-RestMethod -Method Put -Headers $hdr -Uri "$uri/repos/$owner/$name/topics" -Body $topics -ContentType 'application/vnd.github+json' | Out-Null
Write-Output 'description + topics set'
