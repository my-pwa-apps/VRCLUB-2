# Read the HTML file
$content = Get-Content "index.html" -Raw -Encoding UTF8

# Remove metalness properties
$content = $content -replace '; metalness: [\d.]+', ''
$content = $content -replace 'metalness: [\d.]+; ', ''
$content = $content -replace 'metalness: [\d.]+', ''

# Remove roughness properties
$content = $content -replace '; roughness: [\d.]+', ''
$content = $content -replace 'roughness: [\d.]+; ', ''
$content = $content -replace 'roughness: [\d.]+', ''

# Remove emissive properties
$content = $content -replace '; emissive: #[0-9a-fA-F]+', ''
$content = $content -replace 'emissive: #[0-9a-fA-F]+; ', ''
$content = $content -replace 'emissive: #[0-9a-fA-F]+', ''

# Remove emissiveIntensity properties
$content = $content -replace '; emissiveIntensity: [\d.]+', ''
$content = $content -replace 'emissiveIntensity: [\d.]+; ', ''
$content = $content -replace 'emissiveIntensity: [\d.]+', ''

# Clean up double spaces
$content = $content -replace '  +', ' '

# Write back to file
$content | Set-Content "index.html" -Encoding UTF8

Write-Host "`n✅ Fixed all unsupported material properties!" -ForegroundColor Green
Write-Host "Removed: metalness, roughness, emissive, emissiveIntensity`n" -ForegroundColor White
