// Atmospheric Haze System - Volumetric fog for VR Club
// Creates theatrical haze effects for enhanced light visibility

class HazeSystem {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.log = options.logger || console;
        
        // Haze configuration
        this.hazeActive = true;
        this.hazeDensity = options.density || scene.fogDensity || 0.05;
        this.hazeColor = options.color || new BABYLON.Color3(0.015, 0.012, 0.018); // Dark atmospheric color
        
        // Fog mode
        this.fogMode = BABYLON.Scene.FOGMODE_EXP;
        
        // Particle haze (optional)
        this.particleHaze = null;
        this.particlesEnabled = options.particles !== false;
    }

    /**
     * Initialize atmospheric haze
     */
    createHaze() {
        // Apply scene fog
        this._applySceneFog();
        
        // Optional particle haze for more dramatic effect
        if (this.particlesEnabled) {
            this._createParticleHaze();
        }
        
        this.log.info?.('✅ Atmospheric haze system created');
    }

    /**
     * Apply Babylon.js scene fog
     */
    _applySceneFog() {
        if (!this.hazeActive) {
            this.scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
            return;
        }
        
        this.scene.fogMode = this.fogMode;
        this.scene.fogColor = this.hazeColor;
        this.scene.fogDensity = this.hazeDensity;
        
        // For EXP2 mode (if desired)
        // this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    }

    /**
     * Create particle-based haze for more volume
     */
    _createParticleHaze() {
        // Haze particle system
        const particleSystem = new BABYLON.ParticleSystem("hazeParticles", 500, this.scene);
        
        // Particle texture - soft gradient
        particleSystem.particleTexture = new BABYLON.Texture(
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAABbklEQVR4nO3aMU4CQRSH8c8Yi4MYTMQTmHgBG0svwAlsLLyBl9DKRL2DlZQm2lhbW1sbC4oJBYULDIQMsLuzb9n3t8T9ZuZ9/8wMDMMwDMMwDMMwDMMwKvIKCEBApQg5ApHyfQHegBlghDwBjfZ9C7x5wAJ4At4Bz8AOaCIPQCt9vwEewRPwBFwDO+ADeAAegB3wBjwBF0AN2ANvgD5wA4yALfAEPAAHQB+4AfpAHTgCBsAJOAb6wD7wBPSBCbADLoA1MAVGwB44Bl6AFjAB7oAlsAZmQB1YAGNgBqyBMXABrIAZMASmQA24AOAGGAET4AFYABNgB1wBY2ABPABz4AioA0tgCkyAGbAFRsASmAPvwBxYA1NgC1wBc2AF3AEnYAfMAQ6BIbAC7oAeMAc4BIbACtgBZ0AHmAMcAkNgBdwBPWAOcAgMgRWwA86ADjAHOASGwArYAWdAB5gDHAJDYAXsgDPgE/gC/gD7cqb5fJX5jQAAAABJRU5ErkJggg==",
            this.scene
        );
        
        // Emission area - entire venue
        particleSystem.emitter = new BABYLON.Vector3(0, 4, -12);
        particleSystem.minEmitBox = new BABYLON.Vector3(-10, -2, -15);
        particleSystem.maxEmitBox = new BABYLON.Vector3(10, 4, 5);
        
        // Particle behavior
        particleSystem.color1 = new BABYLON.Color4(0.8, 0.8, 0.9, 0.08); // Increased opacity
        particleSystem.color2 = new BABYLON.Color4(0.7, 0.7, 0.8, 0.05); // Increased opacity
        particleSystem.colorDead = new BABYLON.Color4(0.5, 0.5, 0.6, 0);
        
        particleSystem.minSize = 2.0;
        particleSystem.maxSize = 5.0;
        
        particleSystem.minLifeTime = 10.0;
        particleSystem.maxLifeTime = 20.0;
        
        particleSystem.emitRate = 20;
        
        // Slow drift motion
        particleSystem.direction1 = new BABYLON.Vector3(-0.1, 0.1, -0.1);
        particleSystem.direction2 = new BABYLON.Vector3(0.1, 0.2, 0.1);
        particleSystem.gravity = new BABYLON.Vector3(0, 0.01, 0);
        
        particleSystem.minAngularSpeed = 0;
        particleSystem.maxAngularSpeed = 0.2;
        
        // Blending
        particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        
        this.particleHaze = particleSystem;
        particleSystem.start();
    }

    /**
     * Update haze based on audio/time
     */
    update(time, audioData = null) {
        if (!this.hazeActive) return;
        
        // Subtle density pulsing based on configured density
        const pulse = Math.sin(time * 0.5) * 0.003;
        this.scene.fogDensity = this.hazeDensity + pulse;
        
        // Audio reactive - thicken on bass
        if (audioData && audioData.bass > 0.6) {
            this.scene.fogDensity += audioData.bass * 0.01;
        }
    }

    /**
     * Set haze active state
     */
    setActive(active) {
        this.hazeActive = active;
        
        if (active) {
            this._applySceneFog();
            if (this.particleHaze) this.particleHaze.start();
        } else {
            this.scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
            if (this.particleHaze) this.particleHaze.stop();
        }
    }

    /**
     * Set haze density
     */
    setDensity(density) {
        this.hazeDensity = density;
        this.scene.fogDensity = density;
    }

    /**
     * Set haze color
     */
    setColor(color) {
        this.hazeColor = color;
        this.scene.fogColor = color;
    }

    /**
     * Get current settings
     */
    getSettings() {
        return {
            active: this.hazeActive,
            density: this.hazeDensity,
            color: this.hazeColor,
            particlesEnabled: this.particlesEnabled
        };
    }

    /**
     * Apply VR-specific settings
     */
    applyVRSettings() {
        // Reduce density in VR to prevent eye strain
        this.setDensity(0.008);
    }

    /**
     * Apply desktop settings
     */
    applyDesktopSettings() {
        // Full haze effect on desktop
        this.setDensity(0.015);
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this.particleHaze) {
            this.particleHaze.stop();
            this.particleHaze.dispose();
            this.particleHaze = null;
        }
        
        this.scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
        
        this.log.info?.('🗑️ Haze system disposed');
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HazeSystem;
}
