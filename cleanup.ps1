# VR Club Optimization & Cleanup Script
# Run this to clean up temporary files and optimize the project

Write-Host "`n=== VR CLUB CLEANUP & OPTIMIZATION ===" -ForegroundColor Cyan
Write-Host "`n"

# 1. Remove temporary/duplicate files
Write-Host "1. Removing temporary files..." -ForegroundColor Yellow
$filesToRemove = @(
    "fix_materials.ps1",
    "fix_materials.py",
    "js\init.js"
)

foreach ($file in $filesToRemove) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "   Removed: $file" -ForegroundColor Gray
    }
}

# 2. Consolidate documentation
Write-Host "`n2. Consolidating documentation..." -ForegroundColor Yellow
if (Test-Path "README_NEW.md") {
    Move-Item "README_NEW.md" "README.md" -Force
    Write-Host "   Updated README.md" -ForegroundColor Green
}

$docsToArchive = @(
    "HYPERREALISTIC_FEATURES.md",
    "EXPERIENCE_GUIDE.md",
    "LIGHTING_TROUBLESHOOTING.md",
    "LED_WALL.md",
    "LIGHTING_LED_UPDATES.md",
    "PROJECT_SUMMARY.md",
    "QUICK_REFERENCE.md"
)

# Create docs folder
if (-not (Test-Path "docs")) {
    New-Item -ItemType Directory -Path "docs" | Out-Null
    Write-Host "   Created docs/ folder" -ForegroundColor Green
}

foreach ($doc in $docsToArchive) {
    if (Test-Path $doc) {
        Move-Item $doc "docs\$doc" -Force
        Write-Host "   Moved: $doc -> docs/" -ForegroundColor Gray
    }
}

# 3. Optimize HTML (remove extra whitespace)
Write-Host "`n3. Optimizing HTML..." -ForegroundColor Yellow
if (Test-Path "index.html") {
    $html = Get-Content "index.html" -Raw
    # Remove multiple consecutive spaces in HTML
    $html = $html -replace '  +', ' '
    # Keep one blank line maximum
    $html = $html -replace '(\r?\n){3,}', "`r`n`r`n"
    $html | Set-Content "index.html" -NoNewline
    Write-Host "   Optimized index.html" -ForegroundColor Green
}

# 4. Check file sizes
Write-Host "`n4. File size analysis..." -ForegroundColor Yellow
$htmlSize = (Get-Item "index.html").Length / 1KB
$jsSize = (Get-Item "js\club-environment.js").Length / 1KB
$cssSize = (Get-Item "css\styles.css").Length / 1KB

Write-Host "   index.html: $([math]::Round($htmlSize, 2)) KB" -ForegroundColor White
Write-Host "   club-environment.js: $([math]::Round($jsSize, 2)) KB" -ForegroundColor White
Write-Host "   styles.css: $([math]::Round($cssSize, 2)) KB" -ForegroundColor White
Write-Host "   Total: $([math]::Round($htmlSize + $jsSize + $cssSize, 2)) KB" -ForegroundColor Cyan

# 5. Verify structure
Write-Host "`n5. Verifying project structure..." -ForegroundColor Yellow
$requiredFiles = @(
    "index.html",
    "css\styles.css",
    "js\club-environment.js",
    "README.md"
)

$allGood = $true
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "   ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "   ✗ $file MISSING" -ForegroundColor Red
        $allGood = $false
    }
}

# Summary
Write-Host "`n=== OPTIMIZATION COMPLETE ===" -ForegroundColor Green
Write-Host "`nProject Structure:" -ForegroundColor Yellow
Write-Host "  index.html         - Main entry point" -ForegroundColor White
Write-Host "  css/styles.css     - UI styling" -ForegroundColor White
Write-Host "  js/club-environment.js - Core functionality" -ForegroundColor White
Write-Host "  README.md          - Documentation" -ForegroundColor White
Write-Host "  docs/              - Additional documentation" -ForegroundColor White
Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "  1. Test in browser: Open index.html" -ForegroundColor Cyan
Write-Host "  2. Test in VR: Load on Quest 3S" -ForegroundColor Cyan
Write-Host "  3. Check console for any errors (F12)" -ForegroundColor Cyan
Write-Host "`n"

if ($allGood) {
    Write-Host "✓ All systems ready!" -ForegroundColor Green
} else {
    Write-Host "⚠ Some files are missing - check errors above" -ForegroundColor Yellow
}

Write-Host "`n"
