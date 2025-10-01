# HTML Optimization Script
# Removes empty attributes and cleans up code

$htmlPath = "index.html"

Write-Host "`n=== OPTIMIZING HTML ===" -ForegroundColor Cyan

# Read HTML
$html = Get-Content $htmlPath -Raw

# Store original size
$originalSize = $html.Length

# 1. Remove empty material attributes
Write-Host "`n1. Removing empty attributes..." -ForegroundColor Yellow
$html = $html -replace ' material=""', ''
$html = $html -replace '\s+material=""\s+', ' '
Write-Host "   Removed empty material attributes" -ForegroundColor Green

# 2. Clean up multiple spaces (but preserve indentation)
Write-Host "`n2. Normalizing whitespace..." -ForegroundColor Yellow
# Remove trailing spaces
$html = $html -replace ' +(\r?\n)', '$1'
# Normalize multiple blank lines to max 2
$html = $html -replace '(\r?\n){4,}', "`r`n`r`n`r`n"
Write-Host "   Cleaned up whitespace" -ForegroundColor Green

# 3. Remove any console.log calls from inline scripts (if any)
Write-Host "`n3. Removing debug code..." -ForegroundColor Yellow
$html = $html -replace 'console\.log\([^)]+\);?\s*', ''
Write-Host "   Removed console.log statements" -ForegroundColor Green

# Calculate savings
$newSize = $html.Length
$saved = $originalSize - $newSize
$percentSaved = [math]::Round(($saved / $originalSize) * 100, 2)

# Write back
$html | Set-Content $htmlPath -NoNewline

Write-Host "`n=== OPTIMIZATION RESULTS ===" -ForegroundColor Green
Write-Host "  Original size: $($originalSize) bytes" -ForegroundColor White
Write-Host "  New size: $($newSize) bytes" -ForegroundColor White
Write-Host "  Saved: $($saved) bytes ($percentSaved%)" -ForegroundColor Cyan
Write-Host "`n✓ HTML optimized successfully!" -ForegroundColor Green
Write-Host "`n"
