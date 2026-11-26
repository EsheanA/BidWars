// Run manually after following DOCKER.md. This performs no login or gameplay.
import assert from 'node:assert/strict';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8080');
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.pathname !== '/' || base.username || base.password) {
    throw new Error('Use a local HTTP origin for this disposable container check');
}
const request = (path, options = {}) => fetch(new URL(path, base), { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) });
for (const folder of ['BidWarsSVGs', 'GoldSVGs']) {
    const svg = await request(`/${folder}/watch.svg`);
    assert.equal(svg.status, 200, `${folder} missing from runtime image`);
    assert.match(svg.headers.get('content-type'), /svg/);
    assert.match(await svg.text(), /<svg/);
}
const url = '/audioFiles/smoke_fixture.mp3';
const audio = await request(url);
assert.equal(audio.status, 200, 'Create the smoke fixture using DOCKER.md first');
assert.equal(await audio.text(), '0123456789');
assert.equal(audio.headers.get('cache-control'), 'public, max-age=86400, immutable');
const etag = audio.headers.get('etag');
assert.ok(etag);
const range = await request(url, { headers: { Range: 'bytes=2-5' } });
assert.equal(range.status, 206);
assert.equal(range.headers.get('content-range'), 'bytes 2-5/10');
assert.equal(await range.text(), '2345');
const head = await request(url, { method: 'HEAD' });
assert.equal(head.status, 200);
assert.equal(head.headers.get('content-length'), '10');
assert.equal(await head.text(), '');
const cached = await request(url, { cache: 'no-cache', headers: { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' } });
assert.equal(cached.status, 304);
const preflight = await request('/users/login', {
    method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
console.log('PASS: packaged SVGs, audio fixture, cache headers, ETags, ranges, HEAD, and credentialed preflight.');
