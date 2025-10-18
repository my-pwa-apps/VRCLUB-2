# Avatar Directory

This directory contains 3D avatar models in GLB format for use in the VR Club.

## Supported Avatar Types

### 1. VRoid Studio Avatars
- Anime-styled characters
- Created with VRoid Studio (https://vroid.com/en/studio)
- Export as VRM, convert to GLB
- See `docs/VROID_INTEGRATION_GUIDE_2025-10-18.md`

### 2. Ready Player Me Avatars
- Photorealistic characters
- Created at https://readyplayer.me/avatar
- Download as GLB
- See `docs/HOW_TO_ADD_RPM_AVATARS.md`

### 3. Other Sources
- Mixamo characters (https://www.mixamo.com/)
- Sketchfab models (https://sketchfab.com/)
- Custom GLB files

## File Naming Convention

Use descriptive names:
- `vroid_01.glb`, `vroid_02.glb` (VRoid avatars)
- `rpm_casual_male.glb`, `rpm_dressy_female.glb` (Ready Player Me)
- `mixamo_knight.glb`, `custom_avatar.glb` (other sources)

## Usage

Avatar files in this directory are automatically detected by the avatar loader system (`js/readyPlayerMeLoader.js`).

Add file paths to the `avatarLibrary` array:

```javascript
this.avatarLibrary = [
    './js/models/avatars/vroid_01.glb',
    './js/models/avatars/vroid_02.glb',
    './js/models/avatars/rpm_custom.glb',
    // etc.
];
```

## Performance Notes

- **File Size**: Aim for 10-20MB per avatar
- **Mesh Count**: VRoid avatars typically have 30-50 meshes
- **Texture Size**: 2K textures recommended (4K may impact performance)
- **Light Limits**: Materials automatically set to 6 lights max for VR compatibility

## Getting Started

### VRoid Studio (Recommended):
1. Download VRoid Studio (FREE)
2. Create 8-10 diverse avatars
3. Export as VRM
4. Convert to GLB using VRoid Hub
5. Copy GLB files to this directory
6. Update `js/readyPlayerMeLoader.js` avatarLibrary

### Ready Player Me:
1. Visit readyplayer.me/avatar
2. Create custom avatars
3. Download GLB URLs or files
4. Add to avatarLibrary array

See full documentation in `/docs/` for detailed guides.

---

**Current Status**: Empty directory, ready for avatar files  
**Fallback**: System uses procedural avatars if no files present  
**Last Updated**: October 18, 2025
