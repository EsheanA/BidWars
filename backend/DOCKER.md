# Backend container: Ubuntu, Cloud Run, and Vercel

The frontend stays on Vercel. Build with **backend/** as the Docker context; the
repository root and frontend are not part of the image.

## Image contents

The Dockerfile uses Ubuntu 24.04 and the official Node 24.22.3 Linux binary,
verified against its release SHA-256 checksum. Node 24 is an LTS release.
The target architecture selects the x64 or arm64 binary. Build stages install
Python, make and g++ for native dependency fallbacks, run `npm ci`, and compile
with `tsconfig.build.json`. The runtime stage contains production dependencies,
production JavaScript/JSON and both SVG directories. It contains no source tests,
fixtures, TypeScript compiler, build toolchain, host dependencies, environment
files or pre-existing audio.

The runtime user is `bidwars`, UID **10001**, GID **10001**. Application files are
root-owned and readable by that user; `/app/audioFiles` is writable by it. The
entrypoint is `node dist/server.js` directly, so Node receives SIGTERM. No port,
frontend domain, database URL, provider key or audio-storage mode is baked in.
Runtime configuration is still required.

## Build locally

From the repository root:

```bash
docker build -t bidwars-backend:local ./backend
```

On Apple Silicon, this builds a native arm64 image for local tests. When preparing
an image for Cloud Run's Linux x86-64 runtime, build separately:

```bash
docker build --platform linux/amd64 -t bidwars-backend:cloudrun ./backend
```

Both commands only build local images. They do not push or deploy anything.
Pinned base versions should be reviewed and updated for supported security fixes.
Image builds need access to Ubuntu repositories, nodejs.org and npm.

## Disposable local verification

Requires Docker Desktop/the Docker daemon and Docker Compose v2 with `--wait`.
This harness never reads `backend/.env`: all credentials are dummy values. MongoDB
and Redis run without persistent data. They and the backend use only an internal
network with no internet route. A separate Nginx gateway forwards localhost port
8080 to the backend; only this gateway joins a normal bridge network. Docker does
not publish host ports for containers attached exclusively to internal networks.
The gateway and its configuration are only for this local smoke harness and are
not included in the backend image or needed on Cloud Run. Do not add real
credentials or run gameplay against this harness.

If an earlier version starts successfully but the host smoke script reports
`ECONNREFUSED`, rerun the `up` command below to add the gateway. There is no need
to rebuild the backend for this network-only correction.

Start from the repository root:

```bash
docker compose -p bidwars-smoke -f backend/compose.smoke.yaml up --build -d --wait
docker compose -p bidwars-smoke -f backend/compose.smoke.yaml ps
docker compose -p bidwars-smoke -f backend/compose.smoke.yaml logs backend
```

Expected: MongoDB and Redis become healthy, then the backend logs that it is
listening on port **8080**, followed by a healthy gateway. The existing message
`Connected to MongoDB Atlas` is hardcoded; this harness uses the local `mongo`
container, not Atlas. This exercises a configured port different from the
local default of 3000. The backend health check is TCP-based, using its `PORT`.
The root `POST /` requires authentication and is not a public health endpoint.

Create a harmless audio fixture as the container's normal non-root user:

```bash
docker compose -p bidwars-smoke -f backend/compose.smoke.yaml exec -T backend node -e "require('node:fs').writeFileSync(process.env.AUDIO_DIRECTORY + '/smoke_fixture.mp3', '0123456789')"
node backend/scripts/smoke-container.mjs http://127.0.0.1:8080
```

Expected: `PASS` for both SVG folders, audio, cache headers, ETags, byte ranges,
HEAD and credentialed preflight. No speech generation or login is performed.
The ten-byte fixture is only a response/range check, not a playable MP3.

Inspect the runtime user, native bcrypt compatibility and omitted test tooling:

```bash
docker compose -p bidwars-smoke -f backend/compose.smoke.yaml exec -T backend id
docker compose -p bidwars-smoke -f backend/compose.smoke.yaml exec -T backend node -e "const b=require('bcrypt'); if(!b.compareSync('smoke',b.hashSync('smoke',4))) process.exit(1); console.log('bcrypt OK')"
docker compose -p bidwars-smoke -f backend/compose.smoke.yaml exec -T backend sh -c 'test ! -e node_modules/vitest && test ! -e node_modules/typescript && test ! -e dist/test-support && test -z "$(find dist -name "*.test.js" -o -name "*.spec.js")"'
```

The `id` output should show UID/GID 10001. Verify graceful shutdown:

```bash
docker compose -p bidwars-smoke -f backend/compose.smoke.yaml stop -t 10 backend
docker compose -p bidwars-smoke -f backend/compose.smoke.yaml logs backend
docker compose -p bidwars-smoke -f backend/compose.smoke.yaml ps -a
```

Expected: a shutdown log and backend exit code 0, without the eight-second shutdown
timeout. Then remove only this harness's resources:

```bash
docker compose -p bidwars-smoke -f backend/compose.smoke.yaml down -v
```

To check missing mounted storage, use the already built local image with dummy
configuration. `/mnt/missing-audio` is deliberately absent from the image:

```bash
docker run --rm -e NODE_ENV=production -e CORS_ALLOWED_ORIGINS=http://localhost:5173 -e AUDIO_STORAGE=mounted -e AUDIO_DIRECTORY=/mnt/missing-audio -e REDIS_URL=redis://127.0.0.1:1 -e MONGODB_URI=mongodb://127.0.0.1:1/smoke bidwars-backend:smoke
```

Expected: a nonzero exit before any database connection, reporting the missing
audio directory. No local fallback directory should be created.

If a published port is unavailable, stop the process using it or change the host
side of the gateway's Compose port mapping and the URL given to the smoke script together.
Do not start your regular backend with its real `.env` as part of this check.

## Running the image outside the smoke harness

Supply environment variables at runtime using your deployment platform or a local,
untracked `--env-file`. The image itself contains no environment file. If starting
with `docker run`, publish the same container port supplied through `PORT`, and use
container-reachable MongoDB/Redis addresses: `localhost` inside the container means
that container, not your laptop.

For local storage, use `AUDIO_STORAGE=local`. `/app/audioFiles` is writable by the
image user; its files disappear with a removed container unless backed by a volume.
For a bind mount, pre-create the host directory and grant the container user write
access. For a Linux-mounted volume use UID/GID 10001. Avoid fixing permissions by
running the application as root. The smoke harness uses a UID/GID-owned tmpfs.

Stop a standalone container with `docker stop --time 10 CONTAINER_NAME`. The app
has an eight-second drain deadline. A server restart interrupts active games;
there is no automatic game recovery.

## Cloud Run runtime configuration

Use the linux/amd64 image and set these on the service, not during image build:

| Setting | Value |
| --- | --- |
| `NODE_ENV` | `production` (also the image default) |
| `PORT` | Injected by Cloud Run; configure its container port, commonly 8080 |
| `CORS_ALLOWED_ORIGINS` | Exact Vercel production origin or your frontend custom domain |
| `MONGODB_URI` | Your reachable MongoDB connection string, supplied as a secret |
| `REDIS_URL` | Your reachable Redis connection string, supplied as a secret |
| `ACCESS_TOKEN_SECRET` | Stable signing secret supplied as a secret |
| `GROK_KEY`, `LEMON_FOX_KEY` | Provider secrets, supplied only at runtime |
| `AUDIO_STORAGE` | `mounted` |
| `AUDIO_DIRECTORY` | Absolute bucket mount path, e.g. `/mnt/bidwars-audio` |

The browser must be able to reach the service without supplying a Google IAM ID
token; this frontend authenticates using the application's JWT cookies. Configure
the service's invocation/access policy accordingly at deployment while retaining
application authentication. This setup makes no IAM or public-access changes.

Configure a **writable Cloud Storage bucket volume** at that exact path, with mount
options `uid=10001;gid=10001`. Keep the bucket private and grant the service identity
the required bucket-level object permissions. The container must not pre-create the
mount path as a substitute for an actual mount. Cloud Run provisions and authenticates
the mount; the app checks the directory and operating-system read/write permissions.
An actual bucket upload/read/delete smoke test remains necessary at deployment.
No bucket, IAM policy or service is created by the Docker setup.

Use Cloud Run's TCP startup probe on the configured port, or explicitly design a
separate health endpoint later. Do not configure an unauthenticated HTTP probe to
`POST /`. MongoDB/Redis readiness is already gated before listening.

Start with a single-instance deployment for this demo, and avoid splitting traffic
across revisions. Room data in Redis does not coordinate Socket.IO broadcasts,
per-process timers or preparation promises. Session affinity is best effort and
cannot provide distributed game ownership. Instance limits also do not guarantee
zero overlapping instances during deployments/restarts. Multi-instance operation
and restart recovery require additional application work.

WebSocket connections have Cloud Run request timeouts: the default is five minutes,
with a maximum of 60 minutes. Configure a suitable timeout and account for reconnects.
The frontend currently navigates home on disconnect, so a timeout/redeployment can
interrupt play. Open WebSockets keep an instance active and billable. Bucket mounts
also add memory and network overhead; choose resource settings after a real deployment
measurement. No gameplay or bucket latency claim follows from these local checks.

## Frontend stays on Vercel

Set `VITE_SERVER_BASE_URL=https://YOUR_BACKEND_HOST` in the Vercel frontend project's
build environment, then rebuild/redeploy that frontend. It is a public backend
origin, not a secret. If preview deployments use a different backend, configure
that environment separately.

Set backend `CORS_ALLOWED_ORIGINS=https://YOUR_FRONTEND_HOST`. To allow selected
previews, add their exact origins separated by commas. No `*.vercel.app` wildcard
is supported or needed. For a normal Vercel deployment the frontend root stays
`frontend/`; Docker builds only `backend/`.

Login requests already use `credentials: 'include'`, sockets use
`withCredentials: true`, and login cookies use `HttpOnly`, `Secure` and
`SameSite=None`. Both public services must use HTTPS. Cross-site cookies on separate
`vercel.app` and `run.app` sites are still subject to browser third-party-cookie
restrictions; CORS cannot override those browser settings. Same-site custom domains
such as `app.YOUR_DOMAIN` and `api.YOUR_DOMAIN` reduce that dependency while still
requiring the exact frontend origin in CORS.

Login and logout now share `HttpOnly`, `Secure`, `SameSite=None` and `Path=/`.
Logout omits the login cookie lifetime so Express can expire it. The JWT format
and expiration are unchanged. Local unit tests cover both development and
production cookie settings, but cannot establish real browser cookie behavior.
Before launch, verify login, an authenticated profile request, refreshing the
page, joining an auction, and logout in the deployed browser. Confirm the cookie
is removed and a subsequent authenticated profile request is rejected. If the
browser blocks third-party cookies, use same-site HTTPS custom domains for the
frontend and backend; do not weaken the cookie settings or broaden CORS.

## References

- [Node LTS schedule](https://nodejs.org/en/about/previous-releases)
- [Official Node downloads/checksums](https://nodejs.org/dist/v24.22.3/)
- [Cloud Run container contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Cloud Storage volume mounts and UID/GID options](https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts)
- [Cloud Run WebSockets, timeout and affinity guidance](https://docs.cloud.google.com/run/docs/triggering/websockets)
- [Credentialed CORS and third-party cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#requests_with_credentials)
