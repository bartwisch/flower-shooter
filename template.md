# WebXR Template - Project Flowerbed

This template documents the architecture and technologies used in Project Flowerbed, a WebXR gardening experience that can serve as a foundation for new WebXR games and applications.

## Core Technologies

### WebXR Framework Stack
- **Three.js** (`r144-merge` custom fork) - Core 3D graphics engine with Meta's multiview implementation
- **WebXR API** - Native VR/AR support with automatic foveation
- **IWER** (`^0.0.2`) - Polyfill for XR device emulation and testing
- **Bootstrap 5** (`^5.1.3`) - UI framework for 2D landing page

### Architecture Pattern
- **ECSY** (`^0.4.2`) - Entity Component System architecture
- Components in `src/js/components/` define data structures
- Systems in `src/js/systems/` handle all game logic
- Single world entity manages global state

### Build System
- **Webpack 5** (`^5.76.3`) - Module bundler and dev server
- **ESLint** - Code linting with Prettier integration
- **HTML Webpack Plugin** - Template-based HTML generation
- **Copy Webpack Plugin** - Asset pipeline integration
- HTTPS dev server (required for WebXR) on port 8081

### Performance & Optimization
- **three-instanced-uniforms-mesh** (`^0.46.0`) - Efficient instanced rendering
- **three-mesh-bvh** (`^0.5.16`) - Accelerated raycasting and collisions
- **three-mesh-ui** (`^6.5.2`) - 3D UI rendering
- **@tweenjs/tween.js** (`^18.6.4`) - Animation system
- **WebXR Foveation** - Automatic foveated rendering reduces pixel count for performance
- **OCULUS_multiview Extension** - Halves rendering calls on Meta Quest hardware
- **Meta's Three.js Fork** - Built-in multiview support for stereo rendering optimization
- Custom LOD system with hysteresis
- Manual matrix updates (`THREE.Object3D.DefaultMatrixAutoUpdate = false`)
- Target frame rate: 72Hz for Meta Quest devices

### Audio System
- **Howler.js** (`^2.2.3`) - Preferred over THREE.PositionalAudio for enhanced control
- **Advanced Audio Features** - Fade controls, independent positioning, automatic audio pooling
- Compressed audio pipeline with ffmpeg
- Ambient soundscapes and interactive audio
- Spatial positioning independent of Object3D transforms

### Storage & Persistence
- **LocalForage** (`^1.10.0`) - Offline-first storage
- **UUID** (`^8.3.2`) - Unique identifier generation
- Save/load system for user-generated content

### Asset Pipeline
- **Custom asset compression** in `asset_pipeline/`
- GLTF models with KTX2 basis texture compression
- Audio compression via ffmpeg
- Video compression for cutscenes
- Separate `content/` (source) and `src/assets/` (processed) directories

## Project Structure

```
├── src/
│   ├── index.js                 # Main entry point
│   ├── js/
│   │   ├── components/          # ECS Components (data)
│   │   ├── systems/             # ECS Systems (logic)
│   │   ├── lib/                 # Utility libraries
│   │   └── config/              # Environment configurations
│   ├── styles/                  # CSS for 2D UI
│   └── assets/                  # Processed game assets
├── content/                     # Source assets (pre-processing)
├── asset_pipeline/              # Asset compression scripts
└── webpack.config.js            # Build configuration
```

## Key Patterns

### ECS Architecture
```javascript
// Component definition
export class PlayerStateComponent extends Component {}
PlayerStateComponent.schema = {
    viewerTransform: { type: Types.Ref },
    playerHead: { type: Types.Ref },
    velocity: { type: Types.Ref }
};

// System implementation
export class MovementSystem extends System {
    execute(delta, time) {
        this.queries.players.results.forEach(entity => {
            // Update player movement
        });
    }
}
MovementSystem.queries = {
    players: { components: [PlayerStateComponent] }
};
```

### WebXR Session Management
```javascript
// XR session initialization
renderer.xr.enabled = true;
renderer.xr.addEventListener('sessionstart', () => {
    // Configure frame rate, hide 2D UI
});
```

### Asset Loading Pattern
```javascript
// Compressed GLTF loading with caching
const loader = new CompressedGLTFLoader();
const model = await loader.loadAsync(assetUrl);
```

## Development Workflow

### Setup Commands
```bash
yarn install          # Install dependencies  
yarn run serve         # Start dev server (https://0.0.0.0:8081)
```

### Asset Processing
```bash
yarn run compress:gltfs    # Process 3D models
yarn run compress:audio    # Process audio files
yarn run compress:video    # Process video files
```

### Code Quality
```bash
yarn run lint          # ESLint checking
yarn run format        # Prettier formatting
```

## WebXR Best Practices

### Performance Optimization
- Use instanced meshes for repeated geometry
- Implement LOD systems for complex scenes
- Manual matrix updates to control when transforms recalculate
- Spatial audio with distance-based volume
- Texture compression (KTX2 basis) for reduced memory usage
- Leverage automatic WebXR foveation for immediate performance gains
- Utilize OCULUS_multiview extension on Meta Quest to halve rendering calls
- Target 72Hz frame rate for optimal Meta Quest experience

### User Experience
- Graceful fallback for non-VR devices (desktop/mobile controls)
- Loading screens with progress indicators
- Comfort settings (teleportation vs. smooth locomotion)
- Hand tracking integration where available
- In-world camera functionality for user-generated content
- PBR materials with normal maps for high visual quality
- Real-time lighting systems for immersive environments

### Cross-Platform Compatibility
- IWER polyfill for testing without headset
- Responsive 2D landing page
- Mobile-friendly touch controls
- Desktop keyboard/mouse support

## Meta's WebXR Case Study Insights

### Technical Achievements
Project Flowerbed demonstrates that **WebXR can power full-fledged VR games** with:
- High-end rendering (PBR materials, normal maps, metallic/roughness variations)
- High-quality geometry with real-time lighting
- Sophisticated game features (UI systems, teleportation, spatial audio)
- 72Hz performance on Meta Quest hardware

### Architecture Decisions
- **Three.js + ECSY** chosen for mature WebXR support and vibrant community
- **Custom Three.js fork** with Meta's multiview implementation for stereo rendering optimization
- **Howler.js over THREE.PositionalAudio** for better audio control and pooling
- **MIT License** for maximum open-source accessibility

### Performance Insights
- WebXR's built-in foveation provides immediate performance benefits
- Meta Quest's OCULUS_multiview extension dramatically reduces rendering overhead
- Custom asset pipeline essential for managing large-scale 3D content
- Manual matrix update control critical for performance at scale

## Configuration

### Environment Setup
- Development: Uses localhost asset URLs and dev server
- Production: Configured for GitHub Pages deployment
- Asset URLs configured in `src/js/config/github/AssetURLs.js`

### Webpack Aliases
- `@config` → Environment-specific configuration
- `src` → Source directory for clean imports

This template provides a solid foundation for building performant, cross-platform WebXR applications with modern web technologies and established 3D game development patterns.