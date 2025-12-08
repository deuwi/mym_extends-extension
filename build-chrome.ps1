# build-chrome.ps1 - Script pour creer le package Chrome

Write-Host "Building Chrome extension package..." -ForegroundColor Cyan

# Creer le dossier de build
$buildDir = "build-chrome"
if (Test-Path $buildDir) {
    Remove-Item -Recurse -Force $buildDir
}
New-Item -ItemType Directory -Path $buildDir | Out-Null

# Copier tous les fichiers necessaires
Write-Host "Copying extension files..." -ForegroundColor Yellow

$filesToCopy = @(
    "background.js",
    "config.js",
    "content.js",
    "popup.html",
    "popup.js",
    "popup.css",
    "auth-bridge.js",
    "detector.js",
    "ad-blocker-early.js",
    "manifest.json"
)

foreach ($file in $filesToCopy) {
    if (Test-Path $file) {
        Copy-Item $file -Destination $buildDir
        Write-Host "  OK $file" -ForegroundColor Green
    } else {
        Write-Host "  MISSING $file" -ForegroundColor Red
    }
}

# Copier le dossier modules
Write-Host "Copying modules folder..." -ForegroundColor Yellow
if (Test-Path "modules") {
    Copy-Item -Path "modules" -Destination $buildDir -Recurse
    Write-Host "  OK modules/" -ForegroundColor Green
} else {
    Write-Host "  MISSING modules/" -ForegroundColor Red
}

# Copier le dossier icons s'il existe
if (Test-Path "icons") {
    Copy-Item -Path "icons" -Destination $buildDir -Recurse
    Write-Host "  OK icons/" -ForegroundColor Green
}

# Copier le dossier css s'il existe
if (Test-Path "css") {
    Copy-Item -Path "css" -Destination $buildDir -Recurse
    Write-Host "  OK css/" -ForegroundColor Green
}

# Copier le dossier styles s'il existe
if (Test-Path "styles") {
    Copy-Item -Path "styles" -Destination $buildDir -Recurse
    Write-Host "  OK styles/" -ForegroundColor Green
}

Write-Host ""
Write-Host "Chrome build complete!" -ForegroundColor Green
Write-Host "Package location: $buildDir" -ForegroundColor Cyan

# ======== ZIP SOURCE (Non minifié) ========
Write-Host ""
Write-Host "Creating source .zip (non-minified)..." -ForegroundColor Cyan
$zipPathSource = "mym-chat-live-chrome-source.zip"
if (Test-Path $zipPathSource) {
    Remove-Item $zipPathSource -Force
}
Compress-Archive -Path "$buildDir\*" -DestinationPath $zipPathSource -Force
Write-Host "Source ZIP created: $zipPathSource" -ForegroundColor Green

# ======== MINIFICATION ========
Write-Host ""
Write-Host "Minifying JavaScript files..." -ForegroundColor Yellow
node minify.js $buildDir
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: Minification failed, using original files" -ForegroundColor Red
}

# ======== ZIP MINIFIÉ ========
Write-Host ""
Write-Host "Creating minified .zip for Chrome Web Store..." -ForegroundColor Cyan
$zipPath = "mym-chat-live-chrome.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}
Compress-Archive -Path "$buildDir\*" -DestinationPath $zipPath -Force
Write-Host "Minified ZIP created: $zipPath" -ForegroundColor Green

Write-Host ""
Write-Host "Build summary:" -ForegroundColor Cyan
Write-Host "  - Source (non-minified): $zipPathSource" -ForegroundColor White
Write-Host "  - Production (minified): $zipPath" -ForegroundColor White

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Go to chrome://extensions" -ForegroundColor White
Write-Host "  2. Enable Developer mode" -ForegroundColor White
Write-Host "  3. Click Load unpacked" -ForegroundColor White
Write-Host "  4. Select the $buildDir folder" -ForegroundColor White
Write-Host ""
Write-Host "To upload to Chrome Web Store:" -ForegroundColor Yellow
Write-Host "  Upload $zipPath to https://chrome.google.com/webstore/devconsole" -ForegroundColor White
