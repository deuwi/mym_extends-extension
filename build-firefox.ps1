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
    "popup.css",
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

# Utiliser le manifest Firefox - Copier avec encodage UTF8
$manifestContent = Get-Content "manifest-firefox.json" -Raw -Encoding UTF8
Set-Content -Path "$buildDir\manifest.json" -Value $manifestContent -Encoding UTF8 -NoNewline
Write-Host "  OK manifest-firefox.json -> manifest.json" -ForegroundColor Green

Write-Host ""
Write-Host "Firefox build complete!" -ForegroundColor Green
Write-Host "Package location: $buildDir" -ForegroundColor Cyan
Write-Host ""

# ======== ZIP SOURCE (Non minifié) ========
Write-Host "Creating source .zip (non-minified)..." -ForegroundColor Yellow

# Supprimer l'ancien zip s'il existe
if (Test-Path "mym-chat-live-firefox-source.zip") {
    Remove-Item "mym-chat-live-firefox-source.zip"
}

# Créer le zip SOURCE DEPUIS le dossier build-firefox avec paths Unix (/)
$outputZipSource = Join-Path $PWD "mym-chat-live-firefox-source.zip"

# Supprimer l'ancien zip
if (Test-Path $outputZipSource) {
    Remove-Item $outputZipSource -Force
}

# Créer le ZIP manuellement pour forcer les forward slashes
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipSource = [System.IO.Compression.ZipFile]::Open($outputZipSource, [System.IO.Compression.ZipArchiveMode]::Create)

try {
    # Récupérer tous les fichiers du dossier build
    $sourceDir = Join-Path $PWD $buildDir
    $files = Get-ChildItem -Path $sourceDir -Recurse -File
    
    foreach ($file in $files) {
        # Calculer le chemin relatif et FORCER les forward slashes
        $relativePath = $file.FullName.Substring($sourceDir.Length + 1)
        $entryName = $relativePath.Replace('\', '/')
        
        # Ajouter le fichier au ZIP avec le bon path
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipSource, $file.FullName, $entryName) | Out-Null
    }
} finally {
    $zipSource.Dispose()
}

Write-Host "Source ZIP created: mym-chat-live-firefox-source.zip" -ForegroundColor Green

# ======== MINIFICATION ========
Write-Host ""
Write-Host "Minifying JavaScript files..." -ForegroundColor Yellow
node minify.js $buildDir
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: Minification failed, using original files" -ForegroundColor Red
}

# ======== ZIP MINIFIÉ ========
Write-Host ""
Write-Host "Creating minified .zip for Firefox Add-ons..." -ForegroundColor Yellow

# Supprimer l'ancien zip s'il existe
if (Test-Path "mym-chat-live-firefox.zip") {
    Remove-Item "mym-chat-live-firefox.zip"
}

# Créer le zip DEPUIS le dossier build-firefox avec paths Unix (/)
# Firefox Add-ons exige OBLIGATOIREMENT des forward slashes
$outputZip = Join-Path $PWD "mym-chat-live-firefox.zip"

# Supprimer l'ancien zip
if (Test-Path $outputZip) {
    Remove-Item $outputZip -Force
}

# Créer le ZIP manuellement pour forcer les forward slashes
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($outputZip, [System.IO.Compression.ZipArchiveMode]::Create)

try {
    # Récupérer tous les fichiers du dossier build
    $sourceDir = Join-Path $PWD $buildDir
    $files = Get-ChildItem -Path $sourceDir -Recurse -File
    
    foreach ($file in $files) {
        # Calculer le chemin relatif et FORCER les forward slashes
        $relativePath = $file.FullName.Substring($sourceDir.Length + 1)
        $entryName = $relativePath.Replace('\', '/')
        
        # Ajouter le fichier au ZIP avec le bon path
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entryName) | Out-Null
    }
} finally {
    $zip.Dispose()
}

Write-Host "ZIP created: mym-chat-live-firefox.zip" -ForegroundColor Green
Write-Host ""
Write-Host "Build summary:" -ForegroundColor Cyan
Write-Host "  - Source (non-minified): mym-chat-live-firefox-source.zip" -ForegroundColor White
Write-Host "  - Production (minified): mym-chat-live-firefox.zip" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Go to https://addons.mozilla.org/developers/" -ForegroundColor White
Write-Host "  2. Click Submit a New Add-on" -ForegroundColor White
Write-Host "  3. Upload mym-chat-live-firefox.zip (minified)" -ForegroundColor White
Write-Host "  4. Attach mym-chat-live-firefox-source.zip as source code" -ForegroundColor White
