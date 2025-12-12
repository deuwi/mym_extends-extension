# Standardize Console Logging Script
# Converts commented console.log to conditional APP_CONFIG.DEBUG checks

$files = @(
    "..\background.js",
    "..\popup.js",
    "..\content.js",
    "..\modules\badges.js",
    "..\modules\notes.js",
    "..\modules\conversations-list.js",
    "..\modules\auto-polling.js",
    "..\modules\stats.js",
    "..\modules\emoji.js",
    "..\modules\sidebar-toggle.js",
    "..\modules\core.js",
    "..\theme-sync.js"
)

$patterns = @(
    @{
        # Pattern: // // // console.log
        Find = '    // // // console\.log\('
        Replace = '    if (APP_CONFIG.DEBUG) console.log('
    },
    @{
        # Pattern: // // console.log
        Find = '    // // console\.log\('
        Replace = '    if (APP_CONFIG.DEBUG) console.log('
    },
    @{
        # Pattern: // console.log (keep indentation)
        Find = '(\s+)// console\.log\('
        Replace = '$1if (APP_CONFIG.DEBUG) console.log('
    },
    @{
        # Pattern: // console.warn
        Find = '(\s+)// console\.warn\('
        Replace = '$1if (APP_CONFIG.DEBUG) console.warn('
    },
    @{
        # Pattern: // // // // console.log (4x commented)
        Find = '    // // // // console\.log\('
        Replace = '    if (APP_CONFIG.DEBUG) console.log('
    }
)

$totalChanges = 0

foreach ($file in $files) {
    $fullPath = Join-Path $PSScriptRoot $file
    
    if (-not (Test-Path $fullPath)) {
        Write-Host "⚠️  File not found: $fullPath" -ForegroundColor Yellow
        continue
    }
    
    Write-Host "📝 Processing: $file" -ForegroundColor Cyan
    
    $content = Get-Content $fullPath -Raw -Encoding UTF8
    $originalContent = $content
    $fileChanges = 0
    
    foreach ($pattern in $patterns) {
        $matches = [regex]::Matches($content, $pattern.Find)
        if ($matches.Count -gt 0) {
            $content = $content -replace $pattern.Find, $pattern.Replace
            $fileChanges += $matches.Count
        }
    }
    
    if ($fileChanges -gt 0) {
        Set-Content -Path $fullPath -Value $content -Encoding UTF8 -NoNewline
        Write-Host "   ✅ Made $fileChanges change(s)" -ForegroundColor Green
        $totalChanges += $fileChanges
    } else {
        Write-Host "   ⏭️  No changes needed" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "🎉 Total changes: $totalChanges" -ForegroundColor Green
Write-Host "✅ All files processed!" -ForegroundColor Green
