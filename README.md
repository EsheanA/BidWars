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

Round-transition timing

From the project root, start the backend with detailed structured stage logging:

```sh
ROUND_TIMING_DETAILS=true npm run dev --prefix backend
```

Start the frontend normally in another terminal, then play using the two
Playwright windows. Browser timing logs are enabled in Vite development mode.
In each browser's developer console, filter for `round.transition.received`.
Match its `transitionId` with the backend's `round.transition.completed` JSON line.

The backend summary reports `durationMs` from the round-timer callback until the
next item is emitted. Its exclusive breakdown contains `settlementMs`,
`itemGenerationMs`, `audioGenerationMs` (through completed MP3 writing), and
`otherMs` (remaining preparation/storage/broadcast work). Stage-start/completion
entries show where an unfinished transition is waiting. Failures emit
`round.transition.failed` with the stage, elapsed time, and error type; these
structured entries omit error messages, tokens, provider payloads, and item text.
A swallowed persistence error is marked failed rather than logged as a successful
transition; existing settlement behavior itself is unchanged.

The first item is startup and has no between-round summary. Final settlement is
reported as `round.completed` with `nextRound: null`, not as delivery of another
item. `hadWinner` is null until the settlement result is known, then true/false.

Browser `countdownZeroToItemReceivedMs` uses that browser's own monotonic clock,
from observing its previous countdown at zero to receipt of the next item. It is
not animation completion or a measurement of network latency alone. Background
tabs can have throttled countdowns; if zero was not observed for the matching
room/round, the measurement is null with `reason: "countdownZeroNotObserved"`.
Each window has an ephemeral `clientId`; no account identity is logged here.

Backend summaries/start/failure entries are on by default. Set
`ROUND_TIMING_DETAILS=true` for per-stage entries or `ROUND_TIMING_LOGS=false` to
disable backend timing output. Set `VITE_ROUND_TIMING_LOGS=false` to disable browser
logs (or `true` to enable them outside development). Restart the relevant dev
server after changing environment settings. Logging does not prefetch items or
change provider requests, bidding rules, or round durations.
