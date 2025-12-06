# build-firefox.ps1 - Script pour creer le package Firefox

Write-Host "Building Firefox extension package..." -ForegroundColor Cyan

# Creer le dossier de build
$buildDir = "build-firefox"
if (Test-Path $buildDir) {
    Remove-Item -Recurse -Force $buildDir
}
New-Item -ItemType Directory -Path $buildDir | Out-Null

# Copier tous les fichiers necessaires
Write-Host "Copying extension files..." -ForegroundColor Yellow

$filesToCopy = @(
    "background.js",
    "background-firefox.js",
    "background-test.js",
    "browser-polyfill.js",
    "config.js",
    "content.js",
    "popup.html",
    "popup.js",
    "auth-bridge.js",
    "detector.js"
)

foreach ($file in $filesToCopy) {
    if (Test-Path $file) {
        Copy-Item $file -Destination $buildDir
        Write-Host "  OK $file" -ForegroundColor Green
    } else {
        Write-Host "  MISSING $file" -ForegroundColor Red
    }
}

# Utiliser le manifest Firefox - Copier avec encodage UTF8
$manifestContent = Get-Content "manifest-firefox.json" -Raw -Encoding UTF8
Set-Content -Path "$buildDir\manifest.json" -Value $manifestContent -Encoding UTF8 -NoNewline
Write-Host "  OK manifest-firefox.json -> manifest.json" -ForegroundColor Green

Write-Host ""
Write-Host "Firefox build complete!" -ForegroundColor Green
Write-Host "Package location: $buildDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Creating .zip for Firefox Add-ons..." -ForegroundColor Yellow

# Supprimer l'ancien zip s'il existe
if (Test-Path "mym-chat-live-firefox.zip") {
    Remove-Item "mym-chat-live-firefox.zip"
}

# Créer le zip DEPUIS le dossier build-firefox (important!)
cd $buildDir
Compress-Archive -Path * -DestinationPath "..\mym-chat-live-firefox.zip"
cd ..

Write-Host "ZIP created: mym-chat-live-firefox.zip" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Go to https://addons.mozilla.org/developers/" -ForegroundColor White
Write-Host "  2. Click Submit a New Add-on" -ForegroundColor White
Write-Host "  3. Upload mym-chat-live-firefox.zip" -ForegroundColor White
