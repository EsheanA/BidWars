# Backend tests: what to know

Run from `backend/`:

```sh
npm run test:run
npm run test:coverage
npm run build -- --noEmit
```

There are 18 component test files. Parameterized cases share one business rule;
there is no need to memorize every input. Read a file's scenario names and explain
what would go wrong if the rule broke. A high line percentage alone does not prove
correct authorization, race handling, or database behavior.

## How to explain the suite

| Component | Main scenarios | Why they matter |
| --- | --- | --- |
| `auctions/auctionIndex.test.ts` | Valid boundaries and grouped invalid input rules | Prevents invalid selections and preserves the index-zero regression |
| `RedisRooms/Room.test.ts` | Waiting-room defaults, independent state, selection validation | A new room begins in a usable state |
| `repositories/roomRepository.test.ts` | Save/read, missing/corrupt records, deletion isolation, queues, failed storage | Keeps serialization and key selection correct; Redis itself is mocked |
| `services/roomService.test.ts` | Matchmaking, capacity, player removal/presence, failed operations | Players reach an appropriate room and cleanup targets the right membership |
| `services/auctionService.test.ts` | Affordable/unaffordable/inactive bids, item preparation, state changes, dependency failures | Accepted bids update the item without charging early; invalid operations do not mutate state |
| `services/rewardService.test.ts` | New/existing inventory, separate owners, persistent charges, in-game settlement, missing records and failed writes | Inventory and balances reflect the winning bid on supported paths |
| `socket/auth.test.ts` | Valid account/room credentials, invalid tokens, reconnect eligibility, normalized selections | Connections must pass authentication and receive the expected identity |
| `socket/index.test.ts` | Join/reconnect, private room tokens, room broadcasts, game start, disconnect cleanup | Connections join and leave through the intended room lifecycle |
| `socket/GameLogic.test.ts` | Timed rounds, accepted/rejected bid broadcasts, final settlement, completion and failures | Round progression and emitted game state stay consistent; fake timers avoid waiting |
| `tokenHandling/generateToken.test.ts` | Actual signed claims, expiry boundaries, missing secrets/signing failures | Tokens contain the intended claims and lifetime, using a test-only secret |
| `itemGeneration/grok.test.ts` | Provider request/response, unique audio names, completed writes, API/disk failures | Item/media results are usable, with no paid API or real file writes |
| `models/*.test.ts` | Required application fields, numeric values and optional media | Unsaved documents satisfy the application's existing schema contract |
| `routes/userRoutes.test.ts` | Signup/login, password-length regression, unauthenticated requests, profile/inventory, logout, partial/full inventory sales | Protects account access and verifies inventory changes and sale credits |
| `routes/auctionRoutes.test.ts` | Auction catalogue response | Protects the catalogue payload expected by the frontend |
| `app.test.ts` | Import without services/listeners and CORS callbacks | Importing the app is safe for tests; the shared origin policy is checked directly |
| `server.test.ts` | Startup dependencies, missing configuration, failed connection | Startup follows its existing dependency contract with fake listeners |
| `RedisRooms/RoomHandler.test.ts` | Client initialization/failure and detached method binding | Keeps the compatibility entry point usable without exhaustively retesting forwarding methods |

Caller-level auction tests use representative bad values and valid endpoints. The
exhaustive input matrix lives in one shared validator suite. The initial room
contract, initial game announcement, item mapping, and winner settlement each
have one cohesive scenario instead of multiple tests repeating the same action.
Thin forwarding-loop tests and duplicate raw-read checks were removed. Failure
checks and the regressions for completed fixes remain.

## Isolation and scope

`test-support/isolation.ts` blocks live network listeners/connections, fetch, and
unmocked Mongoose queries/saves, including during module evaluation. Test secrets
and URLs replace real environment values; dotenv loading is mocked. Individual
tests substitute their external boundary with a controlled fake or mock. Cleanup
restores timers, mocks, globals, and environment values.

Route tests execute the actual registered handlers using `test-support/routes.ts`.
They do not open HTTP listeners and do not verify Express routing, JSON encoding,
cookie parsing, or HTTP header transport end to end. Socket tests use fake sockets;
model tests validate unsaved documents. No live MongoDB indexes/transactions,
Redis atomicity, provider compatibility, or cross-process races are verified.

The 50 unfinished descriptions and original policy questions are preserved in
[TEST_BACKLOG.md](TEST_BACKLOG.md), outside the executable suite. Their removal
from test files does not mean those proposed safeguards have been implemented.
Current high-value gaps include concurrent joins/bids, room authorization checks,
settlement recovery, and single-connection enforcement. Existing code also has
uncovered error paths in account routes, legacy presence helpers, and the root
app authentication handler; these are not excluded from coverage.

## Cleanup results

Coverage includes **all production TypeScript**, including unimported files, and
excludes tests, declarations, test helpers, dependencies, and generated output.
No executable application code is excluded. Line and statement thresholds are 80%.

| Measurement | Before cleanup | After cleanup |
| --- | ---: | ---: |
| Passing cases | 215 | 179 |
| Executable TODOs | 50 | 0 (moved to backlog) |
| Statements | 78.83% | 87.50% |
| Lines | 78.72% | 87.43% |
| Branches | 75.42% | 83.42% |
| Functions | 87.65% | 92.59% |

Both columns use the same production-TypeScript scope. The original configuration
also counted the auction JSON data, giving 78.86% statements and 78.76% lines;
that small scope difference is not responsible for the improvement.

Useful account/profile/inventory/logout and two sale cases raised coverage.
Pruning retained the existing covered production paths. Full suite and TypeScript
checks pass. The existing uuidv4 deprecation warning remains; fixing production
UUID usage is outside this test-only cleanup.
