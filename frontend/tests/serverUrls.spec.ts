import { test, expect } from '@playwright/test';
import { createServerUrls } from '../src/config/serverUrls.js';

// No browser fixtures or development servers: these cases only construct URLs.
for (const configured of ['http://localhost:8080', 'https://api.bidwars.example', 'https://api.bidwars.example/']) {
    test(`uses ${configured} consistently for requests, sockets and media`, () => {
        const { baseUrl, url } = createServerUrls(configured);
        const expected = configured.replace(/\/$/, '');
        expect(baseUrl).toBe(expected);
        expect(url('/users/me')).toBe(`${expected}/users/me`);
        expect(url('audioFiles/watch.mp3')).toBe(`${expected}/audioFiles/watch.mp3`);
        expect(url('/GoldSVGs/watch.svg')).toBe(`${expected}/GoldSVGs/watch.svg`);
    });
}

test('rejects missing or malformed backend configuration with a useful error', () => {
    for (const value of [undefined, '', 'invalid', 'ftp://api.bidwars.example',
        'https://api.bidwars.example/path', 'https://user:password@api.bidwars.example',
        'https://api.bidwars.example?query=1', 'https://api.bidwars.example#fragment']) {
        expect(() => createServerUrls(value)).toThrow('VITE_SERVER_BASE_URL');
    }
});
