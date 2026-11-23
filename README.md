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

### Comparing round timing with the saved baseline

Keep `/tmp/bidwars-timing.log` as the original recording. From the repository root,
restart the backend with a separate output file:

```bash
ROUND_TIMING_DETAILS=true npm run dev --prefix backend 2>&1 | tee /tmp/bidwars-prefetch-timing.log
```

Run the frontend in another terminal, then open the two isolated Playwright windows
from the frontend directory:

```bash
npx playwright test e2e/multiplayer.spec.ts --headed --workers=1
```

Use separate accounts in the same auction. Play several complete games under similar
conditions, including rounds with winners and without bids. These manual games use
your configured services and paid providers; unit-test isolation does not apply to
the development servers. No manual game is run by the automated verification here.

Backend timing records are JSON lines in the terminal and the captured file, alongside
existing application output. Filter transition summaries for each recording:

```bash
rg '"event":"round.transition.completed"' /tmp/bidwars-timing.log
rg '"event":"round.transition.completed"' /tmp/bidwars-prefetch-timing.log
```

Compare `durationMs`: it still measures **server round-timer expiry to next-item
emission**. The saved winner-round observations were:

| Transition | Gap | Settlement | Item generation | Audio generation | Other |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 → 2 | 30,933 ms | 493.55 ms | 28,636.48 ms | 1,366.98 ms | 436 ms |
| 2 → 3 | 18,280.75 ms | 499.40 ms | 16,075.47 ms | 1,267.45 ms | 438.43 ms |

The new `breakdown` has `settlementMs`, `preparationWaitMs` (only the wait remaining
after settlement), `activationMs`, `presenceRefreshMs`, and `otherMs`. These describe
non-overlapping work inside the gap. Full background preparation appears separately
in `item.preparation.ready.durationMs`; do not add it to the gap or subtract it to
calculate `otherMs`.

Match records by `roomId`, `gameId`, `round`, and `transitionId`:

- `item.preparation.attempt`: stage and attempt number.
- `item.preparation.stage.completed`: successful stage duration, including its room-liveness check.
- `item.preparation.retry`: failed-attempt duration, error type, and retry delay.
- `item.preparation.ready`: full preparation duration, including retry waits.
- `item.preparation.boundary`: whether the result was ready at timer expiry.
- `item.preparation.boundary.ready`: remaining time from timer expiry until readiness;
  this can overlap settlement and must not be added to the gap breakdown.
- `round.transition.completed`: next-item gap and exclusive breakdown.
- `round.completed`: final settlement, with no next item; exclude from gap averages.
- `game.stopped` and failure/cleanup records: cancellation or error outcomes. A swallowed
  settlement failure is marked failed and does not produce a successful transition summary.

Initial preparation is logged for round one, but is excluded from transition gaps.
For browser receipt timing, inspect each window's console for
`round.transition.received`. It has an ephemeral `clientId` and the same correlation
IDs. `countdownZeroToItemReceivedMs` uses the browser's own clock; it is null if the
local countdown did not reach zero before the server closed bidding (or a background
tab was throttled). It excludes item animation/render completion. Browser records
are not written to the backend log. They are enabled in frontend development by
default; `VITE_ROUND_TIMING_LOGS=true/false` overrides that setting.

The baseline contains only two gaps. Compare multiple new observations and retry
counts before drawing conclusions; no gameplay latency improvement has yet been
measured for this implementation.
