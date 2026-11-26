// Pure configuration helper; usable without a browser or Vite environment.
export function createServerUrls(value: string | undefined) {
    if (!value?.trim()) throw new Error('VITE_SERVER_BASE_URL must be set to the backend HTTP(S) origin');
    let parsed: URL;
    try { parsed = new URL(value.trim()); }
    catch { throw new Error('VITE_SERVER_BASE_URL must be a valid HTTP(S) origin'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.hostname.includes('*')) {
        throw new Error('VITE_SERVER_BASE_URL must be an HTTP(S) origin without a path or credentials');
    }
    const baseUrl = parsed.origin;
    return {
        baseUrl,
        url: (path: string) => `${baseUrl}/${path.replace(/^\/+/, '')}`
    };
}
