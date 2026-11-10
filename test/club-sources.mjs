import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const UI_LAYERS = ['10-ui-controls.js', '10-ui-menu.js', '10-ui-social.js', '10-ui.js'];
export const AUDIO_CROWD_LAYERS = ['11-audio.js', '11-avatars.js', '11-crowd.js', '11-audio-crowd.js'];
const club = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'club');

/** Read a complete UI/audio layer for isolated classic-script harnesses with a stub superclass. */
export function readClubSource(file) {
    const path = resolve(file instanceof URL ? fileURLToPath(file) : file);
    const layers = path === join(club, '10-ui.js') ? UI_LAYERS :
        path === join(club, '11-audio-crowd.js') ? AUDIO_CROWD_LAYERS : null;
    return layers ? layers.map(name => readFileSync(join(club, name), 'utf8')).join('\n') :
        readFileSync(file, 'utf8');
}
