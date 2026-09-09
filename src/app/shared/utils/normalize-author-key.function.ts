export function normalizeAuthorKey(name: string): string {
    return name
        .toLowerCase()
        .replace(/\.(tv|com|ru|net|cc|moe|biz|org|info|me)$/i, '')
        .replace(/[\s.\-_]/g, '');
}
