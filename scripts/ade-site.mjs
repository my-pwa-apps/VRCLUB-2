export const ADE_ROBOTS_DIRECTIVE = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

export function prepareADESite(html, headers) {
    const page = html
        .replace('<html lang="en">', '<html lang="en" data-live-event="ade">')
        .replace(/<title>[^<]*<\/title>/, '<title>NOCTURNE / ADE concept</title>')
        .replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${ADE_ROBOTS_DIRECTIVE}">`)
        .replace(/^[ \t]*<meta (?:name="(?:description|twitter:[^"]+)"|property="og:[^"]+")[^>]*>\r?\n/gm, '')
        .replace(/^[ \t]*<link rel="(?:canonical|sitemap)"[^>]*>\r?\n/gm, '')
        .replace(/<meta itemprop="[^"]+"[^>]*>\s*/g, '')
        .replace(/\s+(?:itemscope(?:="[^"]*")?|item(?:type|prop)="[^"]*")/g, '');
    const siteHeaders = headers.replace(/^  X-Robots-Tag:.*$/m, `  X-Robots-Tag: ${ADE_ROBOTS_DIRECTIVE}`);
    if (!page.includes('data-live-event="ade"') ||
        !page.includes(`name="robots" content="${ADE_ROBOTS_DIRECTIVE}"`) ||
        !siteHeaders.includes(`X-Robots-Tag: ${ADE_ROBOTS_DIRECTIVE}`)) {
        throw new Error('ADE site build could not apply its branding and non-indexing directives.');
    }
    return { html: page, headers: siteHeaders, robots: 'User-agent: *\nAllow: /\n' };
}
