import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const BRANDINGS = Object.freeze({
    nocturne: Object.freeze({ id: 'nocturne', assets: [] }),
    ade: Object.freeze({
        id: 'ade',
        assets: ['branding/ade/ade26-30y-black.png', 'branding/ade/notice.txt'],
        logoHash: '787f9f7cb59eeef414d0c3a1622a42cc158b97cc070b97c776be6ed5b59ef696'
    })
});

export function resolveBranding(args = [], env = {}) {
    const flags = args.filter(arg => arg.startsWith('--branding'));
    if (flags.length > 1 || flags.some(arg => !/^--branding=(nocturne|ade)$/.test(arg))) {
        throw new Error('Use one --branding=nocturne or --branding=ade option.');
    }
    const id = flags[0]?.split('=')[1] ?? env.VRCLUB_BRANDING ?? 'nocturne';
    if (!Object.hasOwn(BRANDINGS, id)) throw new Error(`Unknown branding: ${id}`);
    return BRANDINGS[id];
}

export async function validateBranding(branding, root) {
    if (branding.id !== 'ade') return;
    const bytes = await readFile(path.join(root, branding.assets[0]));
    if (createHash('sha256').update(bytes).digest('hex') !== branding.logoHash) {
        throw new Error('ADE logo changed; verify provenance before updating the branding checksum.');
    }
}

export function brandHtml(html, branding) {
    if (branding.id === 'nocturne') return html;
    const page = html
        .replace('<html lang="en">', '<html lang="en" data-branding="ade">')
        .replace(/<title>[^<]*<\/title>/, '<title>NOCTURNE / ADE independent concept</title>')
        .replace('<h1 id="experienceOverviewTitle"',
            '<p class="credits-note">Independent ADE-dressed concept. No ADE partnership, endorsement or live venue feed is implied. Artwork is not MIT or Creative Commons. <a href="branding/ade/notice.txt" class="credit-link">Artwork source and usage notice</a>.</p>\n            <h1 id="experienceOverviewTitle"');
    if (!page.includes('data-branding="ade"') || !page.includes('href="branding/ade/notice.txt"')) {
        throw new Error('Branding build could not add the variant marker and artwork disclosure.');
    }
    return page;
}
