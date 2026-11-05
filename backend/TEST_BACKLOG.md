# Pending backend safeguards

These 50 descriptions were moved out of executable test files. They are not implemented or approved requirements. Some describe known defects; others need product decisions.

Confirmed decisions: bids are increments in the UI, and a player should have only one active connection. The old multiple-connection description below is preserved for traceability and must be replaced with a single-connection rule before implementation. Issues 1 (Redis clearing) and 2 (auction indexes) have already been fixed.

## server.test.ts

- should initialize room storage and socket handling before accepting connections
- should leave no active listener when socket initialization fails
- should handle a port-listening failure as a failed startup without leaving connected resources behind

## tokenHandling/generateToken.test.ts

- should distinguish account access tokens from room access tokens with an enforceable token purpose

## models/User.test.ts

- should reject a negative or non-finite user balance

## models/Item.test.ts

- should require an owner for an inventory item
- should reject zero, negative, or fractional inventory quantities
- should reject negative or non-finite item values and winning bids

## itemGeneration/grok.test.ts

- should select only rarities allowed by the agreed meaning of the auction's rarity limit
- should reject a refused, null, or incomplete generated item before requesting speech
- should reject generated monetary values outside the auction's agreed limits
- should reject missing provider credentials before calling external services
- should reject unsuccessful speech HTTP responses and responses without an audio body
- should keep audio filenames inside the audio directory when generated names contain path separators
- should reject source-stream errors without hanging or returning a successful audio URL
- should clean up incomplete audio files when speech streaming fails

## services/auctionService.test.ts

- should reject zero, negative, non-finite, and nonnumeric bids
- should reject bids that do not exceed the current highest bid
- should reject bids outside an active auction round
- should retain the highest accepted bid when bid updates overlap
- should reject generated items with missing fields or invalid monetary values before saving them

## services/rewardService.test.ts

- should skip inventory writes and balance deductions when an item has no winner
- should return no balance update for a round with no winner
- should reject settlement for a missing or invalid winning bid
- should report failed inventory queries, inventory saves, and persistent balance updates to the game loop
- should prevent the next round from treating a partially persisted reward as settled
- should avoid awarding or charging twice when settlement of the same round is retried

## services/roomService.test.ts

- should keep only room IDs in matchmaking queues when skipping unavailable rooms
- should avoid adding the same player twice when a join is retried
- should prevent overlapping joins from exceeding the room's player limit
- should keep the room participant and stored player's active status synchronized in both directions
- should make setting all players active use the same room key as other room operations
- should distinguish a storage failure from a player that does not exist
- should report failed room deletion or presence updates to the caller

## socket/auth.test.ts

- should reject verified tokens whose required identity or room claims are missing or have invalid types
- should reject an access token whose user ID differs from the supplied handshake user ID
- should reject a room token when the player belongs to a different room
- should prevent a room token from being used as an account access token and vice versa

## socket/index.test.ts

- should start at most one game loop when multiple players finish joining a full room together
- should keep a player active when another authenticated socket for that player remains connected
- should restore the current round state when a player reconnects during a game
- should remove partial room membership when socket joining or room-token issuance fails

## socket/GameLogic.test.ts

- should derive the bidding player from the authenticated socket instead of trusting a submitted user ID
- should reject a bid submitted through a socket outside the player's current room
- should stop accepting bids while a round is settling and after the final round ends
- should prevent a bid already in progress from changing an item after its round closes
- should let a player who reconnects during a round receive updates and bid in that round
- should cancel remaining round timers and bid handlers when a game is aborted or its room is removed

## RedisRooms/RoomHandler.test.ts

- should preserve existing rooms and players when the Redis client connects or reconnects

## RedisRooms/Room.test.ts

- should prevent changing one room's bid options from changing other rooms or the auction configuration

## Decisions and historical findings

The notes below preserve the original questions. D1 and the Redis reset portion of D6 are resolved; re-check current code before treating any historical finding as an open defect.


### D1 — Auction selection

- `socket/auth.ts` stores `auctionIndex` as a string, while `socket/index.ts`
  declares a number and rejects falsy values. Numeric zero is a valid configured
  auction but fails that check. Other invalid selections can become undefined
  auction names, balances, or bid options.
- Proposal: normalize once at the connection boundary and reject missing,
  non-integer, or out-of-range selections before any mutation. Should direct room
  and auction service calls also enforce that validation?

### D2 — Room state and matchmaking

- `RoomService.findRoom` pushes a serialized room into a queue otherwise holding
  room IDs when it encounters a full/started room. Should unavailable rooms be
  removed from the waiting queue entirely?
- Player records created by matchmaking have no `userid` field, but
  `toggleSingleUserActiveStatus` compares room participants with `user.userid`.
  Room state is also updated only when becoming inactive; the room-wide refresh
  only sets active values to true. Proposal: synchronize both directions using
  the method's explicit player ID.
- `setUsersToActive` reads an unprefixed room key. Should this unused helper be
  fixed or removed? `Room.setBidOptions` also shares the configuration's array
  between room instances; the proposed outline asks for independent room state.
- Duplicate and overlapping joins currently have no explicit protection. Confirm
  that retrying a join must preserve one membership and never exceed capacity.

### D3 — Bid rules and closing a round

- Bid acceptance currently checks only active status and available balance. It
  does not require a positive finite amount, an increase over the previous bid,
  or an open round. Storage updates are separate reads and writes.
- Confirm whether bids are absolute totals or increments, whether fractional
  currency is allowed, and whether only configured bid steps should be accepted.
- Proposal: reject invalid/non-increasing bids and late bids, and prevent an
  overlapping lower bid from replacing a higher accepted bid. The exact contract
  for a bid arriving at the round deadline needs agreement.

### D4 — Reward settlement

- Items begin with `bidder_id: ""`, but reward code checks only for `null`. A
  no-bid round can therefore try to award an item or look up an empty player ID.
  Proposal: treat both as no winner and skip writes and balance broadcasts.
- `distributeItemDB` logs and swallows failures. The game can then deduct the
  in-game balance and continue despite an incomplete persistent reward. Several
  writes also lack rollback/retry protection.
- Should a failed reward pause/abort the round, or be retried? Confirm whether a
  round must be settled at most once, including after a partial failure, before
  implementing the proposed retry and failure cases.

### D5 — Identity and room authorization

- `GameLogic` trusts the user ID submitted in a bid rather than deriving it from
  the authenticated socket. Reconnect authentication checks that a player exists,
  but not that their stored room matches the room-token claim.
- Verified JWT payloads are cast to types without validating required claims.
  Account and room tokens also share a secret without an enforced token purpose.
- Proposal: validate claims and room membership, bind bids to socket identity,
  and prevent interchange of account and room tokens. A token-purpose change
  needs a decision about existing issued tokens.

### D6 — Startup and Redis reconnect behavior

- `RoomHandler` calls `flushDb()` on every Redis connection, which can erase
  active rooms and players. Proposal: preserve state on connection/reconnection;
  any development reset should be an explicit, separate operation.
- The server begins listening before socket/Redis initialization completes. A
  later failure is logged without closing the listener, and listener errors are
  not handled by the surrounding async catch.
- Confirm startup should accept connections only after dependencies are ready
  and release resources on failure. These are proposed changes, not implemented
  fixes in this outline.

### D7 — Dependency-failure contract

- Some operations throw strings, some throw errors, and others log and return
  success-shaped results. For example, `userExist` treats a Redis failure as a
  nonexistent player; room deletion and setting users active swallow failures.
- Proposal: let callers distinguish missing records from dependency failures and
  react to failed writes. Decide the failure contract before implementing those
  expectations; this plan does not lock in swallowed failures as correct behavior.

### D8 — AI item and audio validation

- A completion with `parsed: null` is not explicitly rejected before speech is
  requested. Numeric schema fields do not enforce the auction's value limits.
  Speech responses are not checked for HTTP success or a non-null body.
- Audio filenames contain the model-generated item name with only spaces
  replaced; path separators are not handled. Stream-source failures and cleanup
  of partial output files need a defined policy.
- `chooseRarity` can select index `auction.rarities`. Does that setting mean a
  number of permitted rarities or an inclusive maximum index? Which value and
  starting-bid limits must be enforced locally rather than requested in a prompt?
- Proposal: fail before producing a successful URL for invalid generation,
  missing credentials, unsuccessful speech, or incomplete streaming, and keep
  generated audio paths inside the intended directory.

### D9 — Reconnects, multiple sockets, and game cleanup

- Presence is toggled for each connection/disconnection, so multiple tabs or
  retries can produce the wrong active status. Reconnects receive no explicit
  current-round replay, and bid handlers are attached to the sockets present at
  the beginning of a round.
- Timers and bid handlers are not explicitly canceled when a game aborts, and
  a join failure after partial membership creation has no explicit rollback.
- Confirm whether multiple sockets per player are supported, what state a
  reconnect should receive, and whether it may bid immediately in the same round.
  The proposed cleanup and one-game-loop cases depend on these decisions.

### D10 — Model validation boundaries

- Current schemas require neither nonnegative monetary values nor positive
  integer inventory quantities. Item ownership is typed as required in the
  interface but optional in the schema; bid and audio fields are also optional.
- Should these constraints be enforced in schemas, services, or both? Are negative
  account balances or zero-quantity inventory records ever intentional? Proposed
  model-validation groups should be revised to match that policy before coding.

