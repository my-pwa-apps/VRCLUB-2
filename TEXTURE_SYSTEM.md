# Industrial Concrete Texture System

## Overview
The VR Club automatically downloads high-quality industrial concrete textures from **Polyhaven CDN** on first run and caches them in the browser's **IndexedDB** for instant loading on subsequent visits.

## Features

### ✅ Automatic CDN Download
- Downloads textures from Polyhaven public CDN (no API key required)
- Uses 2K resolution for optimal quality/performance balance
- Downloads all texture maps in parallel for fast loading

### 💾 Smart Browser Caching
- Uses **IndexedDB** for persistent storage
- Textures cached permanently until browser cache is cleared
- First load: ~3-5 seconds download time
- Subsequent loads: **instant** (loaded from cache)

### 🎨 PBR Texture Maps Applied

Each surface gets 4 texture maps:
1. **Diffuse/Albedo** - Base color and details
2. **Normal Map** - Surface bumps and depth (OpenGL format)
3. **Roughness Map** - Matte/shiny variations
4. **Ambient Occlusion** - Shadows in crevices

## Texture Assignments

### Floor: Polished Concrete (worn)
- **Source**: `concrete_floor_worn_001` from Polyhaven
- **UV Scale**: 4x4 (repeats 4 times across the floor)
- **Character**: Industrial polished concrete with subtle wear marks
- **Perfect for**: Dance floor - smooth but aged

### Walls: Industrial Concrete
- **Source**: `concrete_wall_001` from Polyhaven
- **UV Scale**: 3x3 (repeats 3 times on walls)
- **Character**: Raw warehouse concrete with imperfections
- **Perfect for**: Club walls - authentic industrial feel

### Ceiling: Raw Concrete Panels
- **Source**: `concrete_panels_02` from Polyhaven
- **UV Scale**: 3x3 (repeats 3 times on ceiling)
- **Character**: Rough concrete with exposed aggregate
- **Perfect for**: Industrial ceiling - authentic warehouse look

## Technical Details

### CDN URLs
All textures are downloaded from:
```
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/{texture_name}/{filename}
```

### File Sizes (approximate)
- Each 2K texture map: ~1-2 MB
- Total download (all maps): ~15-20 MB
- Cached size in IndexedDB: ~15-20 MB

### Browser Compatibility
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (iOS and macOS)
- ✅ Quest Browser (Meta Quest 3/3S)
- ✅ All modern browsers with IndexedDB support

## Fallback System

If texture download fails (offline, CDN down, etc.):
- **Floor**: Falls back to procedural noise texture
- **Walls**: Uses solid PBR color material
- **Ceiling**: Uses solid PBR color material
- ⚠️ Warning logged to console, but club continues to work

## Cache Management

### Check Cache Status
Open browser console and check for these messages:
```
💾 Using cached: concrete_floor_worn_001_diff_2k.jpg
💾 Using cached: concrete_wall_001_nor_gl_2k.jpg
```

### Clear Cache (Force Re-download)
```javascript
// In browser console:
const club = window.club; // Access the VRClub instance
await club.textureLoader.clearAllCaches();
location.reload(); // Reload page to re-download
```

### Manual Cache Management
IndexedDB can be inspected/cleared via:
- **Chrome DevTools**: Application → Storage → IndexedDB → VRClubTextureCache
- **Firefox DevTools**: Storage → IndexedDB → VRClubTextureCache

## Performance Impact

### First Load (Download)
- Download time: 3-5 seconds (depending on connection)
- Scene creation delayed until textures load
- Shows progress in console

### Cached Load (Subsequent)
- Load time: ~100-300ms (instant)
- No network requests
- Zero delay for scene creation

### Runtime Performance
- PBR materials slightly more expensive than simple materials
- 2K textures optimized for VR performance
- Normal maps add realistic depth without geometry cost

## Customization

### Change Texture Sources
Edit `js/textureLoader.js` → `getTextureConfigs()`:
```javascript
floor: {
    name: 'Your Custom Floor',
    baseUrl: 'https://your-cdn.com/path/to/texture',
    maps: {
        diffuse: 'your_texture_diff.jpg',
        normal: 'your_texture_nor.jpg',
        // ...
    }
}
```

### Adjust UV Scaling
Modify `scale` property in texture configs:
```javascript
scale: { u: 4, v: 4 } // Increase for more repetition, decrease for larger tiles
```

### Add New Surfaces
Add new texture configs and apply them to materials:
```javascript
// In textureLoader.js
bar: {
    name: 'Wood Bar Top',
    baseUrl: '...',
    // ...
}

// In club_hyperrealistic.js
if (this.concreteTextures && this.concreteTextures.bar) {
    this.textureLoader.applyTexturesToMaterial(barMat, this.concreteTextures.bar);
}
```

## Polyhaven License

All textures from Polyhaven are **CC0 (Public Domain)**:
- ✅ Free for commercial use
- ✅ No attribution required
- ✅ Can be modified
- ✅ Can be redistributed

**Source**: https://polyhaven.com/license

## Troubleshooting

### Textures not loading?
1. Check browser console for error messages
2. Verify internet connection (first load only)
3. Check if CDN is accessible: https://polyhaven.com/
4. Try clearing cache and reloading

### Textures look wrong?
- Check UV scaling in texture configs
- Verify normal map format (OpenGL vs DirectX)
- Check if roughness map is in correct channel (green)

### Performance issues?
- Reduce texture resolution (change `2k` to `1k` in URLs)
- Reduce UV scaling (fewer repetitions)
- Disable some texture maps (keep only diffuse + normal)

## Future Enhancements

Possible improvements:
- [ ] Progressive texture loading (low-res first, then high-res)
- [ ] Texture compression (KTX2/Basis format)
- [ ] Dynamic quality adjustment based on device
- [ ] Preload screen with progress bar
- [ ] Additional surface textures (bar wood, metal pipes, etc.)
