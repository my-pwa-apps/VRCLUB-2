const fs = require('fs');
const code = fs.readFileSync('js/club_hyperrealistic.js', 'utf8');

const regex = new RegExp(`(\\s*)updateAnimations\\s*\\([^\\)]*\\)\\s*\\{`, '');
const match = regex.exec(code);
if (match) {
    const startIndex = match.index;
    let openBraces = 0;
    let i = startIndex + match[0].length;
    let inString = false;
    let stringChar = '';
    openBraces = 1;

    while(i < code.length && openBraces > 0) {
        let char = code[i];
        if (inString) {
            if (char === stringChar && code[i-1] !== '\\') inString = false;
        } else {
            if (char === "'" || char === '"' || char === "`") {
                inString = true;
                stringChar = char;
            } else if (char === '{') {
                openBraces++;
            } else if (char === '}') {
                openBraces--;
            } else if (char === '/' && code[i+1] === '*') {
                let j = code.indexOf('*/', i+2);
                if (j !== -1) {
                    i = j + 1;
                }
            } else if (char === '/' && code[i+1] === '/') {
                let j = code.indexOf('\n', i+2);
                if (j !== -1) {
                    i = j;
                } else {
                    i = code.length;
                }
            }
        }
        i++;
    }

    const newAnimStr = `\n    updateAnimations() {
        const time = performance.now() / 1000;
        const deltaTime = this.engine.getDeltaTime() / 1000;
        this.frameCounter++;

        const audioData = this.getAudioData() || { baseEnergy: 0, low: 0, mid: 0, high: 0 };

        // Modular System Master Update
        if (this.useModularSystems && this.systems.vjControl) {
            // Sync toggles and settings to the VJ console state
            if (this.systems.laser) this.systems.laser.setActive(this.lasersActive);
            // Sync spot color changes
            if (this.systems.spotlight && this.currentSpotColor) {
               this.systems.spotlight.currentSpotColor = this.currentSpotColor;
            }
            if (this.systems.spotlight) {
                this.systems.spotlight.setActive(this.lightsActive);
                this.systems.spotlight.spotlightSpeed = this.spotlightSpeed || 1.0;
                this.systems.spotlight.spotlightMode = this.spotlightMode;
                this.systems.spotlight.spotlightPattern = this.spotlightPattern;
                this.systems.spotlight.spotStrobeActive = this.spotStrobeActive;
            }
            if (this.systems.mirrorBall) this.systems.mirrorBall.setActive(this.mirrorBallActive);
            if (this.systems.ledWall) this.systems.ledWall.setActive(this.ledWallActive);
            if (this.systems.strobe) this.systems.strobe.setActive(this.strobesActive);
            if (this.systems.haze) this.systems.haze.setActive(this.smokeActive);

            this.systems.vjControl.update(time, audioData);
        }

        // Update NPCs
        if (this.npcAvatars && this.npcAvatars.length > 0) {
            this.updateDancingNPCs(time);
        }
    }`;

    const newCode = code.substring(0, startIndex) + newAnimStr + code.substring(i);
    fs.writeFileSync('js/club_hyperrealistic.js', newCode);
    console.log('Replaced updateAnimations. Removed ' + (i - startIndex) + ' chars.');
}