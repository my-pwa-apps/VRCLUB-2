# VR Club Avatar Setup Script
# Prepares project for VRoid avatar integration

Write-Host ""
Write-Host "🎭 VR Club - Avatar Integration Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if avatars directory exists
$avatarDir = ".\js\models\avatars"
if (-Not (Test-Path $avatarDir)) {
    New-Item -ItemType Directory -Path $avatarDir -Force | Out-Null
    Write-Host "✅ Created avatars directory: $avatarDir" -ForegroundColor Green
} else {
    Write-Host "✅ Avatars directory already exists: $avatarDir" -ForegroundColor Green
}

# Check for existing avatar files
$avatarFiles = Get-ChildItem -Path $avatarDir -Filter "*.glb" -ErrorAction SilentlyContinue
if ($avatarFiles.Count -gt 0) {
    Write-Host "📦 Found $($avatarFiles.Count) existing avatar file(s)" -ForegroundColor Yellow
    $avatarFiles | ForEach-Object { Write-Host "   - $($_.Name)" -ForegroundColor Gray }
} else {
    Write-Host "📭 No avatar files found yet (directory is ready)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 Next Steps - Choose Your Method:" -ForegroundColor Cyan
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "Option 1: VRoid Studio Sample (⭐ RECOMMENDED - Fastest)" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "Time: 30-45 minutes" -ForegroundColor Gray
Write-Host "Difficulty: Easy" -ForegroundColor Gray
Write-Host ""
Write-Host "1. Download VRoid Studio (FREE):" -ForegroundColor White
Write-Host "   https://vroid.com/en/studio" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Launch VRoid Studio → Click 'Open Sample'" -ForegroundColor White
Write-Host ""
Write-Host "3. Create 8 variations by changing:" -ForegroundColor White
Write-Host "   - Hair colors (blonde, brown, black, red, blue, etc.)" -ForegroundColor Gray
Write-Host "   - Outfit colors" -ForegroundColor Gray
Write-Host "   - Skin tones" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Export each as VRM:" -ForegroundColor White
Write-Host "   File → Export → VRM 0.0" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Convert VRM to GLB:" -ForegroundColor White
Write-Host "   - Visit: https://hub.vroid.com/" -ForegroundColor Cyan
Write-Host "   - Upload VRM files" -ForegroundColor Gray
Write-Host "   - Download as GLB" -ForegroundColor Gray
Write-Host ""
Write-Host "6. Copy GLB files to: $avatarDir" -ForegroundColor White
Write-Host "   Rename as: vroid_01.glb, vroid_02.glb, ... vroid_08.glb" -ForegroundColor Gray
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "Option 2: Sketchfab (No Conversion Needed)" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "Time: 1 hour" -ForegroundColor Gray
Write-Host "Difficulty: Easy" -ForegroundColor Gray
Write-Host ""
Write-Host "1. Visit Sketchfab:" -ForegroundColor White
Write-Host "   https://sketchfab.com/3d-models?features=downloadable" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Search for: 'anime character' or 'vtuber model'" -ForegroundColor White
Write-Host ""
Write-Host "3. Filter by:" -ForegroundColor White
Write-Host "   - ✅ Downloadable" -ForegroundColor Gray
Write-Host "   - ✅ CC0 or CC-BY license" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Download 8 models as GLB format (direct)" -ForegroundColor White
Write-Host ""
Write-Host "5. Copy GLB files to: $avatarDir" -ForegroundColor White
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "Option 3: BOOTH (Most Variety)" -ForegroundColor Magenta
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "Time: 1-2 hours" -ForegroundColor Gray
Write-Host "Difficulty: Medium (Japanese site)" -ForegroundColor Gray
Write-Host ""
Write-Host "1. Visit BOOTH:" -ForegroundColor White
Write-Host "   https://booth.pm/" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Search: 'VRoid 配布' (VRoid distribution)" -ForegroundColor White
Write-Host "   Filter by: 0円 (0 yen = FREE)" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Download 8 free VRM models" -ForegroundColor White
Write-Host ""
Write-Host "4. Convert to GLB at VRoid Hub (see Option 1, step 5)" -ForegroundColor White
Write-Host ""
Write-Host "5. Copy GLB files to: $avatarDir" -ForegroundColor White
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "After Getting Avatars:" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "1. Ensure 8 GLB files are in: $avatarDir" -ForegroundColor White
Write-Host ""
Write-Host "2. Edit: js\readyPlayerMeLoader.js" -ForegroundColor White
Write-Host "   - Find 'avatarLibrary' array (line ~14)" -ForegroundColor Gray
Write-Host "   - Uncomment avatar paths:" -ForegroundColor Gray
Write-Host "     './js/models/avatars/vroid_01.glb'," -ForegroundColor DarkGray
Write-Host "     './js/models/avatars/vroid_02.glb'," -ForegroundColor DarkGray
Write-Host "     ... (all 8 avatars)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "   - Find 'useAvatarLibrary' (line ~39)" -ForegroundColor Gray
Write-Host "   - Change to: useAvatarLibrary = true" -ForegroundColor DarkGray
Write-Host ""
Write-Host "3. Test the application:" -ForegroundColor White
Write-Host "   npm start" -ForegroundColor Cyan
Write-Host ""
Write-Host "4. Open browser: http://localhost:8000" -ForegroundColor White
Write-Host ""
Write-Host "5. Check console for:" -ForegroundColor White
Write-Host "   '✅ Loaded VRoid avatar with XX meshes'" -ForegroundColor Green
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Full guides available in docs/ folder:" -ForegroundColor White
Write-Host "  - VROID_QUICK_START_2025-10-18.md (step-by-step)" -ForegroundColor Gray
Write-Host "  - VROID_INTEGRATION_GUIDE_2025-10-18.md (comprehensive)" -ForegroundColor Gray
Write-Host "  - FREE_VROID_AVATARS_2025-10-18.md (where to download)" -ForegroundColor Gray
Write-Host "  - SAMPLE_AVATAR_URLS_2025-10-18.md (specific sources)" -ForegroundColor Gray
Write-Host "  - AVATAR_LIBRARY_OPTIONS_2025-10-18.md (all options)" -ForegroundColor Gray
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "✅ Setup complete! Follow steps above to add avatars." -ForegroundColor Green
Write-Host ""
Write-Host "💡 Tip: Option 1 (VRoid Studio Sample) is fastest for beginners!" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to open VRoid Studio download page..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Open VRoid Studio download page
Start-Process "https://vroid.com/en/studio"

Write-Host ""
Write-Host "🌐 Opened VRoid Studio download page in browser" -ForegroundColor Green
Write-Host ""
Write-Host "Good luck creating your club's avatars! 🎨✨" -ForegroundColor Cyan
Write-Host ""
