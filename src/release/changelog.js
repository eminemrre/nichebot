function extractVersionSection(changelogText, version) {
    const normalizedVersion = String(version || '').trim();
    if (!normalizedVersion) return null;

    const text = String(changelogText || '');
    const headerPattern = new RegExp(`^## \\[${escapeRegex(normalizedVersion)}\\](?:\\s*-\\s*.+)?$`, 'm');
    const headerMatch = text.match(headerPattern);
    if (!headerMatch || headerMatch.index === undefined) return null;

    const sectionStart = headerMatch.index;
    const nextHeaderPattern = /^## \[[^\]]+\](?:\s*-\s*.+)?$/gm;
    nextHeaderPattern.lastIndex = sectionStart + headerMatch[0].length;
    const nextHeaderMatch = nextHeaderPattern.exec(text);
    const sectionEnd = nextHeaderMatch ? nextHeaderMatch.index : text.length;

    const section = text.slice(sectionStart, sectionEnd).trim();
    return section || null;
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    extractVersionSection,
};
