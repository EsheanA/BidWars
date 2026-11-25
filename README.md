# BidWars

BidWars is a real-time multiplayer auction game where players compete to win items, manage limited balances, and outbid each other before each auction ends.

Built as a full-stack project focused on real-time systems, state synchronization, authentication, and external API integration.

Deployment note: BidWars is not currently live because some of its external services, including text-to-speech, incur ongoing usage costs. The repository remains available for code review.

### Tech Stack

* Frontend: React, Vite, Tailwind CSS, DaisyUI
* Backend: Node.js, Express, Socket.IO
* Data: MongoDB Atlas, Redis / Upstash
* AI: Grok API, Lemonfox TTS
* Deployment: Vercel, Render

### Key Features

* Real-time multiplayer auction rooms
* Live bidding and synchronized game state with Socket.IO
* Player balances and post-game item distribution
* JWT authentication using HTTP-only cookies
* Room-level authorization
* Redis-backed active game state
* MongoDB persistent storage
* AI-generated auctioneer commentary with text-to-speech

### Architecture

React Client
     │
 HTTP / WebSocket
     │
     ▼
Express + Socket.IO
   │           │
   ▼           ▼
 Redis       MongoDB
Game State   Persistent Data

The backend acts as the authoritative source of game state. When a player submits a bid, the server validates it, updates the auction state, and broadcasts the result to every connected player in the room.

Redis handles frequently changing multiplayer state, while MongoDB stores longer-lived application data.

### Engineering Highlights

This project gave me hands-on experience with:

* Synchronizing state across multiple clients in real time
* Designing server-authoritative multiplayer logic
* Handling concurrent bidding and validation
* Building authentication and authorization middleware
* Separating temporary and persistent application state
* Integrating third-party AI and text-to-speech APIs
* Deploying a multi-service full-stack application

### Running Locally

Clone the repository:
```bash
git clone <repository-url>
cd BidWars
```
Install dependencies in the frontend and backend directories:
```bash
npm install
```
Configure the required environment variables, then run both development servers:
```bash
npm run dev
```

### Backend startup and shutdown

Compiled backend output is generated locally and is not tracked in Git. For a
production build, run `npm run build --prefix backend`, then
`npm start --prefix backend`.

The backend binds to `0.0.0.0` using `PORT` (default `3000` when unset).
An explicitly supplied port must be an integer from `1` to `65535`.
MongoDB and Redis/socket initialization finish before the HTTP listener opens.
Initial Redis connection attempts are limited to 10 seconds; startup failures
close resources and leave the process with a nonzero exit status.

On `SIGTERM` or `SIGINT`, the server stops accepting players, cancels round timers
and item preparation, and drains existing HTTP/socket/game work before closing
Redis and MongoDB. Shutdown runs once even if multiple signals arrive. A failed
cleanup or an 8-second shutdown timeout terminates the process unsuccessfully.
Active games are interrupted by shutdown; their runtime state is not resumed
automatically after a restart.

### Frontend origins and backend URLs

Set `CORS_ALLOWED_ORIGINS` on the backend to the exact frontend origins that may
make browser requests, separated by commas. For example:

```dotenv
NODE_ENV=production
CORS_ALLOWED_ORIGINS=https://bidwars.example,https://preview.bidwars.example
```

Production requires a nonempty list. Development also allows HTTP/HTTPS localhost
origins so the existing local setup keeps working. Include protocol and any
non-default port; paths, credentials and wildcards are rejected. Root trailing
slashes are normalized. The same credentialed policy applies to HTTP requests,
Socket.IO and static assets. Requests without an Origin header remain allowed;
authentication still applies to protected operations.

Set the frontend's `VITE_SERVER_BASE_URL` to the backend origin before starting
Vite or building the frontend. API requests, sockets, audio and backend images all
use this setting. For example, in your local frontend environment:

```dotenv
VITE_SERVER_BASE_URL=http://localhost:3000
```

For deployment, replace that value with your backend's HTTPS origin. This is a
frontend build-time setting, so rebuild after changing it. Use an origin without
an API path, query, credentials or fragment; a root trailing slash is supported.
The `.example` domains above are placeholders, not deployed services.

Run the isolated frontend URL checks from the frontend directory:

```bash
npx --no-install playwright test tests/serverUrls.spec.ts --workers=1
```

These tests use no browsers, development servers or external services.

### Preparing the next auction item

Each game prepares one future item while the current item is open for its usual
20 seconds. Preparation generates a draft and finishes its MP3 without writing
room state. When the timer expires, bidding closes, accepted in-flight bids finish,
and the current item is settled. The game awaits the same preparation promise,
loads fresh room state, and activates that result. It never prepares a fourth item
for a three-round game.

Failed stages retry with increasing delays. A speech failure retains the generated
item and retries speech only. The initial item also uses this retry policy before
gameplay starts. There is no fallback item or retry-count limit; between rounds the
client shows **Preparing next item…** with bidding disabled until preparation is
ready. Provider requests have a 60-second attempt timeout. These backend settings
control retry delays (positive integer milliseconds; invalid values use defaults):

| Setting | Default | Meaning |
| --- | ---: | --- |
| `ITEM_PREPARATION_RETRY_MS` | 1000 | First retry delay, limited to the cap |
| `ITEM_PREPARATION_RETRY_CAP_MS` | 10000 | Maximum delay as retries double |
| `ROUND_TIMING_LOGS` | true | Set `false` to disable backend timing records |
| `ROUND_TIMING_DETAILS` | false | Set `true` for individual transition-stage records |

Preparation is owned by one game loop in the current backend process. Results carry
room, game, round, and transition IDs; activation checks these and an abort signal.
When the last connected socket leaves a room, its game is considered abandoned:
requests are aborted, retry timers stop, and unused completed media is removed.
Late results are discarded; failed or aborted audio streams remove partial files.
A failed file removal is logged and can require manual cleanup. Cancellation is best
effort at the provider and cannot guarantee that an already sent request is unbilled.

This does not add recovery after process restarts, distributed game ownership, or
resumption after abandonment. Existing settlement persistence/error handling and
other authorization, amount, and connection-count policies remain in place.

