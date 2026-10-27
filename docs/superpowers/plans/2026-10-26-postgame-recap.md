# Post-game recap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a room finishes, every account that held a seat sees the result (via a persistent "recap" list status plus an opt-in email) and can optionally answer a small fixed feedback survey, which only the designer (owner) can review, aggregated across every room a game has ever been played in.

**Architecture:** A new `survey_responses` Postgres table, independent of room lifecycle, holds feedback durably. Two small additions to the existing per-room JSONB blob — `roomId` (a durable identity that survives room-code reuse) and `recapViewedBy` (account email → seen) — drive the "has this person looked yet" status in the existing "Your games" list, mirroring how `knownAccounts`/`abandonable` already work. A new HTTP router handles survey submission and the owner-only read; everything else rides on `RoomStore`'s existing join/reconnect/`applyAction` hooks, the same pattern `notifyTurn` already established for the turn-notification email.

**Tech Stack:** TypeScript, Express, Socket.io, Postgres (`postgres` package) via Neon, React (client), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-postgame-recap-design.md`

## Global Constraints

- Standard question text is a TODO placeholder in the spec — do not invent the actual wording; ship the TODO strings as-is pending the designer's copy.
- `survey_responses.account_email` is `NOT NULL` — every seat reaching a room is already signed in, there is no guest path to support.
- `recapViewedBy` is keyed by **account email**, never by seat — one visit from one person clears the whole room regardless of how many seats they hold (the corrected per-player model, not per-seat).
- Once `recapViewedBy[email]` is true, the survey form must never re-render for that account on that room again — answered, skipped, or untouched are all "that was the one chance." No separate "skipped" record.
- No role/permission system exists anywhere else in this app — `AuthService.isOwner` is the first one. The server must enforce it independently of whatever the client shows/hides; never trust a client-side-only gate.
- Every notification email stays fire-and-forget (never awaited inline), matching `RoomStore.notifyTurn`'s existing convention.
- No client-side test runner exists in this codebase. Client tasks are verified via `tsc --noEmit`, `vite build`, and a manual browser check — never invent a client test file.

## Review Focus

- A finished room where every player skipped the survey (or never opened it) still drops correctly off each account's list after their one visit, and the owner's notes view shows nothing for that room — not an error, not a crash.
- A hotseat room (one account holding every seat): one visit clears the whole room's recap status; the survey still offers one form per seat held, since different seats can have different things to say.
- Resubmitting the same `(room_id, seat, question_id)` (e.g. a network retry after a slow response) must not error or create a duplicate row.
- A room that finishes with nobody connected (the real async-play case this whole feature exists for): `notifyGameEnd`'s live-connected branch marks nobody, and the later join/reconnect backfill is what eventually clears the status — this path must not be skipped just because the live-connected branch ran first.
- A non-owner account calling the owner-only survey-read endpoint directly (not through the client's hidden link) must get rejected server-side, never real data — the one actual access-control boundary introduced by this feature.

## File Structure

**New:**
- `packages/shared/src/surveyQuestions.ts` — `STANDARD_SURVEY_QUESTIONS`, shared by client and server.
- `packages/platform/src/surveys/surveyRepository.ts` — `SurveyResponse` type, `SurveyRepository` interface, `InMemorySurveyRepository`, `PostgresSurveyRepository`, `createDefaultSurveyRepository`.
- `packages/platform/test/surveyRepository.test.ts`
- `packages/server/src/surveyRoutes.ts` — submit + owner-only read, mounted at `/survey-responses`.
- `packages/server/test/surveyRoutes.test.ts`
- `packages/client/src/components/RecapPanel.tsx` — shared result + survey panel, used by all 5 games.
- `packages/client/src/views/NotesView.tsx` — owner-only, one per game.

**Modified:**
- `packages/platform/src/db/client.ts` — `ensureSchema()` gains the `survey_responses` table.
- `packages/platform/src/rooms/roomRepository.ts` — `PersistedRoom` gains `roomId`, `recapViewedBy`.
- `packages/platform/src/rooms/roomStore.ts` — `LiveRoom` gains the same two fields; `createRoom` mints `roomId`; `joinRoom`/`reconnectRoom`/`reconnectByAccount` backfill `recapViewedBy`; new `notifyGameEnd`, called from `applyAction`; `OpenGameSummary` gains `status`, drops `isMyTurn`; `listOpenRoomsForAccount` computes it.
- `packages/platform/test/roomStore.test.ts`, `packages/platform/test/roomRepository.test.ts`
- `packages/platform/src/auth/authService.ts` — `verifyToken`/`checkSession` gain `isOwner`.
- `packages/platform/test/authRepository.test.ts` is unaffected (no repo change); `authService` has no dedicated test file today — its behavior is exercised via `packages/server/test/auth.test.ts`, which gets new cases.
- `packages/platform/src/index.ts` — export the new survey pieces.
- `packages/server/src/app.ts`, `packages/server/src/index.ts` — wire `surveyRouter` + `createDefaultSurveyRepository()`.
- `packages/server/src/myGamesRoutes.ts` — map/sort by `status` instead of `isMyTurn`.
- `packages/server/test/myGames.test.ts`, `packages/server/test/auth.test.ts`
- `packages/client/src/state/myGames.ts`, `packages/client/src/views/HomeView.tsx` — `status` replaces `isMyTurn`; recap link/badge.
- `packages/client/src/state/authToken.ts`, `packages/client/src/App.tsx`, `packages/client/src/views/VerifyView.tsx` — plumb `isOwner` through, mirroring the existing `turnChimeEnabled` precedent exactly.
- All 5 `GameView.tsx` files (`packages/client/src/games/{mint-condition,love-triangles}/GameView.tsx`, `private-games/other-games/client-{hyperbloom,tashkalar,kingsgate}/GameView.tsx`) and their `HomeView.tsx` siblings — render `RecapPanel` in place of each game's own ad hoc end-of-game text; add the owner-only "Playtest notes" link.

---

### Task 1: `survey_responses` table and `SurveyRepository`

**Files:**
- Create: `packages/platform/src/surveys/surveyRepository.ts`
- Create: `packages/platform/test/surveyRepository.test.ts`
- Modify: `packages/platform/src/db/client.ts`
- Modify: `packages/platform/src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SurveyResponse {
    gameId: string;
    roomId: string;
    roomCode: string;
    seat: string;
    accountEmail: string;
    questionId: string;
    answer: string;
    createdAt: number; // epoch ms, matching every other timestamp in this codebase
  }
  export interface SurveyRepository {
    /** Idempotent on (roomId, seat, questionId) — a duplicate submit (e.g. a network retry) is a silent no-op, never an error or a second row. */
    submit(response: Omit<SurveyResponse, 'createdAt'>): Promise<void>;
    /** Every response for a game, newest first. */
    listForGame(gameId: string): Promise<SurveyResponse[]>;
  }
  export class InMemorySurveyRepository implements SurveyRepository { ... }
  export class PostgresSurveyRepository implements SurveyRepository { ... }
  export function createDefaultSurveyRepository(): SurveyRepository;
  ```

- [ ] **Step 1: Write the failing tests** in `packages/platform/test/surveyRepository.test.ts`, against `InMemorySurveyRepository` only (matching this codebase's existing convention — `roomRepository.test.ts`/`authRepository.test.ts` never exercise the Postgres implementation directly):

```ts
describe('InMemorySurveyRepository', () => {
  it('submit() then listForGame() returns it', async () => { ... });
  it('listForGame() only returns rows for that gameId', async () => { ... });
  it('listForGame() returns newest first', async () => { ... });
  it('a duplicate submit for the same (roomId, seat, questionId) is a no-op, not a second row', async () => { ... });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w @denimcat/platform -- surveyRepository`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `SurveyResponse`/`SurveyRepository`/`InMemorySurveyRepository`/`createDefaultSurveyRepository` in `packages/platform/src/surveys/surveyRepository.ts`**

`InMemorySurveyRepository` keys its internal map by `` `${roomId}:${seat}:${questionId}` `` so a duplicate submit overwrites the same slot rather than appending — same observable effect as the real table's unique index + `ON CONFLICT DO NOTHING` (first write wins; a retry of the identical payload is harmless either way). `createDefaultSurveyRepository` picks Postgres when `getDb()` returns non-null, else `InMemorySurveyRepository` — same shape as `createDefaultRoomRepository`.

- [ ] **Step 4: Implement `PostgresSurveyRepository`**

```sql
CREATE TABLE IF NOT EXISTS survey_responses (
  id SERIAL PRIMARY KEY,
  game_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  seat TEXT NOT NULL,
  account_email TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, seat, question_id)
)
```

Add this `CREATE TABLE IF NOT EXISTS` to `ensureSchema()` in `packages/platform/src/db/client.ts`, following the exact pattern the existing tables there already use.

`submit()`: `INSERT INTO survey_responses (...) VALUES (...) ON CONFLICT (room_id, seat, question_id) DO NOTHING`. **Unlike `PostgresRoomRepository`/`EmailSender`'s fail-soft convention (catch, log, degrade), `submit()` lets a Postgres error propagate** — losing a submitted answer silently would be worse than the caller (the survey route) seeing a failed write and being able to tell the submitter to retry; this is a deliberate exception to the rest of this codebase's fail-soft persistence, not an inconsistency. `listForGame()`: `SELECT * FROM survey_responses WHERE game_id = $1 ORDER BY created_at DESC` — this one stays fail-soft (catch, log, return `[]`), matching `PostgresRoomRepository.findByAccountEmail`'s own read-path convention, since an empty notes page degrading gracefully is fine where losing a submission would not be.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -w @denimcat/platform -- surveyRepository`
Expected: PASS

- [ ] **Step 6: Export from `packages/platform/src/index.ts`**

Add `export { type SurveyResponse, type SurveyRepository, InMemorySurveyRepository, PostgresSurveyRepository, createDefaultSurveyRepository } from './surveys/surveyRepository';` alongside the existing room/auth repository exports.

- [ ] **Step 7: Run the full platform test suite**

Run: `npm run test -w @denimcat/platform`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add packages/platform/src/surveys packages/platform/test/surveyRepository.test.ts packages/platform/src/db/client.ts packages/platform/src/index.ts
git commit -m "Add survey_responses table and SurveyRepository"
```

---

### Task 2: Standard question set

**Files:**
- Create: `packages/shared/src/surveyQuestions.ts`
- Modify: `packages/shared/src/index.ts` (if one exists — otherwise wherever `packages/shared`'s other public types are re-exported from; check `ChatMessage`'s own export site in `contract.ts` and mirror it)

**Interfaces:**
- Produces:
  ```ts
  export interface StandardSurveyQuestion {
    id: string;
    text: string;
  }
  export const STANDARD_SURVEY_QUESTIONS: StandardSurveyQuestion[];
  ```

- [ ] **Step 1: Create `packages/shared/src/surveyQuestions.ts`**

```ts
/** TODO: designer to write the actual question text (see this project's own standing instruction against inventing this kind of copy) — ids are stable so a future wording tweak never orphans an already-submitted answer. */
export interface StandardSurveyQuestion {
  id: string;
  text: string;
}

export const STANDARD_SURVEY_QUESTIONS: StandardSurveyQuestion[] = [
  { id: 'fun', text: 'TODO: question text' },
  { id: 'not-fun', text: 'TODO: question text' },
  { id: 'memorable', text: 'TODO: question text' },
];
```

- [ ] **Step 2: Export it alongside `packages/shared`'s other public types** (check how `ChatMessage`/`RoomInfo` are currently made importable as `@denimcat/shared` and follow the identical pattern — likely a barrel file, possibly `contract.ts` itself serves this role already).

- [ ] **Step 3: Typecheck the shared package**

Run: `cd packages/shared && npx tsc --noEmit` (or this package's equivalent build/typecheck script — check `package.json`)
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/surveyQuestions.ts packages/shared/src/index.ts
git commit -m "Add the standard post-game survey question set"
```

---

### Task 3: `roomId`, `recapViewedBy`, and list status

**Files:**
- Modify: `packages/platform/src/rooms/roomRepository.ts`
- Modify: `packages/platform/src/rooms/roomStore.ts`
- Modify: `packages/platform/test/roomRepository.test.ts`
- Modify: `packages/platform/test/roomStore.test.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces:
  ```ts
  // roomRepository.ts — PersistedRoom gains:
  roomId: string;
  recapViewedBy?: Record<string, true>; // account email -> viewed

  // roomStore.ts — LiveRoom gains the same two fields (recapViewedBy: Record<string, true>, never optional on the live shape — default {}).

  // OpenGameSummary<TSeat> — isMyTurn: boolean is REMOVED, replaced by:
  status: 'your-turn' | 'waiting' | 'recap';
  ```

- [ ] **Step 1: Write the failing tests** in `packages/platform/test/roomRepository.test.ts` (`InMemoryRoomRepository` round-trips `roomId`/`recapViewedBy` — just confirm `save`/`get` preserve them, same style as every other field already covered there) and `packages/platform/test/roomStore.test.ts`:

```ts
describe('RoomStore.createRoom', () => {
  it('mints a roomId that survives the room being hydrated fresh from the repository', async () => { ... });
});

describe('RoomStore.listOpenRoomsForAccount status', () => {
  it('status is "your-turn" when the active seat is mine', async () => { ... });
  it('status is "waiting" when it is not my turn and the game is not finished', async () => { ... });
  it('status is "recap" once the game is finished and I have not yet viewed it', async () => { ... });
  it('a finished room drops off the list entirely once I have viewed it', async () => { ... });
  it('a hotseat room (I hold every seat) clears for the WHOLE room from one visit, not seat-by-seat', async () => { ... });
});

describe('RoomStore join/reconnect backfills recapViewedBy', () => {
  it('joinRoom marks recapViewedBy for an account arriving into an already-finished room', async () => { ... });
  it('reconnectRoom marks recapViewedBy for an account reconnecting into an already-finished room', async () => { ... });
  it('reconnectByAccount marks recapViewedBy for an account arriving into an already-finished room', async () => { ... });
  it('joining/reconnecting into a NOT-yet-finished room never touches recapViewedBy', async () => { ... });
});
```

Use this test file's existing module/harness fixtures (a `GameModule` stub with `isRoomFinished`/`getActiveSeat` — check how the existing `isMyTurn`/`abandonable` describe blocks around line 523 and 150 already build one, and reuse that same pattern).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w @denimcat/platform -- roomStore roomRepository`
Expected: FAIL (`roomId`/`recapViewedBy`/`status` don't exist yet).

- [ ] **Step 3: Add `roomId`/`recapViewedBy` to `PersistedRoom`** (`roomRepository.ts`, next to the existing `knownAccounts` field, with a matching doc comment explaining `roomId` exists because `code` gets reused once a room is deleted — see `roomCode.ts`'s ~1M-value alphabet and `createRoom`'s collision check, which only looks at currently-existing rooms).

- [ ] **Step 4: Add `roomId`/`recapViewedBy` to `LiveRoom`, mint `roomId` in `createRoom` (`roomStore.ts:155-167`), default `recapViewedBy: {}`, and round-trip both through `hydrateRoom` (`roomStore.ts:206-218`) and `persist` (`roomStore.ts:687-699`)**

Mint `roomId` with `nanoid()` (the file already imports `nanoid` for chat-message ids — reuse it, default length is fine, this is an internal identity never shown to a user).

- [ ] **Step 5: Backfill `recapViewedBy` in `joinRoom` (`roomStore.ts:226-272`), `reconnectRoom` (`roomStore.ts:274-307`), `reconnectByAccount` (`roomStore.ts:324-360`)**

In each, right after the account is known to be `accountEmail`/the resolved account for that seat, and only when `this.module.isRoomFinished?.(room.gameState)` is true: `room.recapViewedBy[accountEmail] = true`. (`reconnectByAccount` already resolves the account as its own `accountEmail` parameter; `joinRoom`/`reconnectRoom` take it as a parameter too — use that, not `room.knownAccounts[role]`, since the two should already agree and the parameter is what the other backfills in these same methods already use.)

- [ ] **Step 6: Replace `isMyTurn` with `status` in `OpenGameSummary` and `listOpenRoomsForAccount` (`roomStore.ts:73-87`, `580-604`)**

```ts
async listOpenRoomsForAccount(email: string): Promise<OpenGameSummary<TSeat>[]> {
  const rooms = await this.repository.findByAccountEmail(this.module.id, email);
  const out: OpenGameSummary<TSeat>[] = [];
  for (const room of rooms) {
    const isFinished = this.module.isRoomFinished?.(room.gameState) ?? false;
    if (isFinished && room.recapViewedBy?.[email]) continue; // seen it — same as today's unconditional skip, now gated on having actually looked
    const mySeats = room.seatOrder.filter((seat) => room.knownAccounts?.[seat] === email);
    const activeSeat = this.module.getActiveSeat?.(room.gameState) ?? null;
    const otherPlayerNames = /* unchanged */;
    const status: OpenGameSummary<TSeat>['status'] = isFinished
      ? 'recap'
      : activeSeat !== null && mySeats.includes(activeSeat)
        ? 'your-turn'
        : 'waiting';
    out.push({ gameId: this.module.id, code: room.code, mySeats, seatCount: room.seatOrder.length, status, lastActivityAt: room.lastActivityAt, createdAt: room.createdAt, abandonable: !isFinished && this.isAbandonable(room.seatOrder, room.knownAccounts, mySeats), otherPlayerNames });
  }
  return out;
}
```

(`abandonable` becomes `false` once finished — an ended game isn't "abandoned," it's over, and the client should offer a different action there.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test -w @denimcat/platform`
Expected: PASS. The pre-existing `isMyTurn`-named tests around `roomStore.ts:523-556` need updating to assert `status` instead — update them in place rather than leaving a `isMyTurn` reference pointing at nothing.

- [ ] **Step 8: Commit**

```bash
git add packages/platform/src/rooms packages/platform/test/roomRepository.test.ts packages/platform/test/roomStore.test.ts
git commit -m "Add roomId and recapViewedBy; replace isMyTurn with a recap-aware status"
```

---

### Task 4: `notifyGameEnd`

**Files:**
- Modify: `packages/platform/src/rooms/roomStore.ts`
- Modify: `packages/platform/test/roomStore.test.ts`

**Interfaces:**
- Consumes: `recapViewedBy`/`roomId` from Task 3.
- Produces: `applyAction` fires a new private `notifyGameEnd(room, previousState)`, called alongside the existing `notifyTurn(room, previousState)` call at `roomStore.ts:436`.

- [ ] **Step 1: Write the failing tests** in `packages/platform/test/roomStore.test.ts`:

```ts
describe('RoomStore.notifyGameEnd', () => {
  it('emails every seat with a knownEmails entry once the room becomes finished', async () => { ... });
  it('does not email again on a later action once already finished', async () => { ... }); // mirrors notifyTurn's own "only fires once per transition" test
  it('marks recapViewedBy true for every account with a currently-connected socket at the moment the game ends', async () => { ... });
  it('does NOT mark recapViewedBy for an account with no live connection at that moment', async () => { ... }); // the async-play case — left for the join/reconnect backfill instead
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w @denimcat/platform -- roomStore`
Expected: FAIL.

- [ ] **Step 3: Implement `notifyGameEnd` in `roomStore.ts`, called from `applyAction` (`roomStore.ts:436`)**

```ts
private notifyGameEnd(room: LiveRoom<TState, TSeat>, previousState: TState): void {
  if (!this.module.isRoomFinished) return;
  if (this.module.isRoomFinished(previousState) || !this.module.isRoomFinished(room.gameState)) return;

  for (const seat of room.seatOrder) {
    const liveSeat = room.seats[seat];
    const account = room.knownAccounts[seat];
    if (liveSeat?.socketId && account) room.recapViewedBy[account] = true;
  }

  for (const seat of room.seatOrder) {
    const email = room.knownEmails[seat];
    if (!email) continue;
    // same link-building as notifyTurn (roomStore.ts:478-483)
    const subject = `Game over in ${this.module.displayName} — see how it ended`;
    const text = /* same link-or-not pattern as notifyTurn */;
    this.emailSender.send(email, subject, text).catch((error) => console.error(`[roomStore:${this.module.id}] game-end notification failed:`, error));
  }
}
```

`notifyGameEnd` mutates `room.recapViewedBy` directly, but `applyAction` currently calls `this.persist(room)` *before* `notifyTurn` (line 434-436) — if that ordering stays, `notifyGameEnd`'s mutation only ever lives in memory until some later action re-persists the room, which may never happen for a room that just finished. **Move the `persist(room)` call to run after both `notifyTurn(room, previousState)` and `notifyGameEnd(room, previousState)`**, so this one persist captures everything, including whatever `notifyGameEnd` just set on `recapViewedBy`:

```ts
room.gameState = result.state;
room.lastActivityAt = Date.now();
this.broadcastState(room, result.data);
this.notifyTurn(room, previousState);
this.notifyGameEnd(room, previousState);
await this.persist(room);
return { ok: true };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w @denimcat/platform`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/rooms/roomStore.ts packages/platform/test/roomStore.test.ts
git commit -m "Notify every seat's email and mark live accounts' recap viewed when a room finishes"
```

---

### Task 5: `AuthService.isOwner`

**Files:**
- Modify: `packages/platform/src/auth/authService.ts`
- Modify: `packages/server/test/auth.test.ts`

**Interfaces:**
- Produces: `verifyToken`/`checkSession` both gain `isOwner: boolean` in their return object.

- [ ] **Step 1: Write the failing tests** in `packages/server/test/auth.test.ts` (this is where `authService` is already exercised end-to-end, per this task's file list above — add cases alongside the existing session/profile tests):

```ts
it('isOwner is true for the configured OWNER_EMAIL and false for anyone else', async () => {
  // sign in as the owner email the test harness already configures AuthService with, and as some other address; assert isOwner on both /auth/verify and /auth/session responses
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @denimcat/server -- auth`
Expected: FAIL.

- [ ] **Step 3: Implement in `authService.ts`**

Add `isOwner: boolean` to both interface method return types (`verifyToken`/`checkSession`). Compute it once as a local helper and use it in both:

```ts
function isOwnerEmail(email: string, ownerEmail: string | undefined): boolean {
  return ownerEmail !== undefined && email.toLowerCase() === ownerEmail.toLowerCase();
}
```

`verifyToken` returns `isOwner: isOwnerEmail(consumed.email, ownerEmail)`; `checkSession` returns `isOwner: isOwnerEmail(session.email, ownerEmail)`. No changes needed in `authRoutes.ts` — both routes already spread the full result object into the JSON response.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @denimcat/server -- auth`
Expected: PASS.

- [ ] **Step 5: Run the full platform + server suites**

Run: `npm run test -w @denimcat/platform && npm run test -w @denimcat/server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/platform/src/auth/authService.ts packages/server/test/auth.test.ts
git commit -m "Add AuthService.isOwner"
```

---

### Task 6: Survey submission and owner-only read routes

**Files:**
- Create: `packages/server/src/surveyRoutes.ts`
- Create: `packages/server/test/surveyRoutes.test.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Consumes: `SurveyRepository`/`SurveyResponse` (Task 1), `STANDARD_SURVEY_QUESTIONS` (Task 2), `AuthService.isOwner` (Task 5), `GameStoreEntry`/`RoomStore.getRoom`/`LiveRoom.roomId` (Task 3).
- Produces:
  ```ts
  export function surveyRouter(authService: AuthService, gameStores: GameStoreEntry[], surveyRepository: SurveyRepository, clientOrigins: string[]): Router;
  // POST /  body: { gameId: string; roomCode: string; seat: string; answers: { questionId: string; answer: string }[] }
  // GET /:gameId  — owner-only
  ```

- [ ] **Step 1: Write the failing tests** in `packages/server/test/surveyRoutes.test.ts`, following `myGames.test.ts`'s real-socket-server harness pattern (same `createServer`/`io`/`RoomStore` setup):

```ts
describe('POST /survey-responses', () => {
  it('accepts answers from a seat the signed-in account actually holds, once the room is finished', async () => { ... });
  it('rejects a room that is not yet finished', async () => { ... });
  it('rejects a seat the signed-in account does not hold', async () => { ... });
  it('rejects an unknown questionId', async () => { ... });
  it('rejects a missing/invalid session, and malformed payloads', async () => { ... });
  it('resubmitting the same seat/question is a harmless no-op, not an error', async () => { ... });
});

describe('GET /survey-responses/:gameId', () => {
  it('returns every response for that game to the owner account', async () => { ... });
  it('rejects a signed-in non-owner account', async () => { ... });
  it('rejects a missing/invalid session', async () => { ... });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w @denimcat/server -- surveyRoutes`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `surveyRoutes.ts`**

`POST /`: validate `gameId`/`roomCode`/`seat` are non-empty strings and `answers` is a non-empty array of `{questionId, answer}` where `questionId` is one of `STANDARD_SURVEY_QUESTIONS`'s ids and `answer` is a non-empty string, trimmed, capped at 2000 chars (reject over that, mirroring `MAX_CHAT_LENGTH`'s bounding style in `roomHandlers.ts`). Resolve `{module, store} = gameStores.find((g) => g.module.id === gameId)`; `404`-equivalent `{ok:false}` if not found. `room = await store.getRoom(roomCode)`; `{ok:false}` if missing, if `!module.isRoomFinished?.(room.gameState)`, or if `room.knownAccounts[seat] !== session.email` (ownership check — never trust the client's claimed seat). On success, `await Promise.all(answers.map((a) => surveyRepository.submit({ gameId, roomId: room.roomId, roomCode: room.code, seat, accountEmail: session.email, questionId: a.questionId, answer: a.answer.trim() })))`, respond `{ok:true}`.

`GET /:gameId`: bearer session required; `session.isOwner` required, else `{ok:false}`. `responses = await surveyRepository.listForGame(req.params.gameId)`, respond `{ok:true, responses}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w @denimcat/server -- surveyRoutes`
Expected: PASS.

- [ ] **Step 5: Wire into `app.ts` and `index.ts`**

`app.ts`: add `surveyRepository: SurveyRepository` to `createApp`'s `deps`, mount `app.use('/survey-responses', surveyRouter(deps.authService, deps.gameStores ?? [], deps.surveyRepository, deps.clientOrigins));`.
`index.ts`: `const surveyRepository = createDefaultSurveyRepository();`, pass it into `createApp({...})`.

- [ ] **Step 6: Run the full server suite**

Run: `npm run test -w @denimcat/server`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/surveyRoutes.ts packages/server/test/surveyRoutes.test.ts packages/server/src/app.ts packages/server/src/index.ts
git commit -m "Add survey submission and owner-only survey-read routes"
```

---

### Task 7: `myGamesRoutes.ts` + client "Your games" status

**Files:**
- Modify: `packages/server/src/myGamesRoutes.ts`
- Modify: `packages/server/test/myGames.test.ts`
- Modify: `packages/client/src/state/myGames.ts`
- Modify: `packages/client/src/views/HomeView.tsx`

**Interfaces:**
- Consumes: `OpenGameSummary.status` (Task 3).
- Produces: `MyGame.status: 'your-turn' | 'waiting' | 'recap'` (replaces `isMyTurn`); `GET /my-games` sorts `your-turn` first, then `recap`, then `waiting`, each group newest-created first.

- [ ] **Step 1: Write the failing tests**, updating the existing `isMyTurn`-named assertions in `packages/server/test/myGames.test.ts` (around line 119-143 and the sort-order test around line 198-235) to assert `status` instead, plus:

```ts
it('a finished, unviewed room shows status "recap" and sorts ahead of "waiting"', async () => { ... });
it('a finished room the account has viewed is absent from the list entirely', async () => { ... });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w @denimcat/server -- myGames`
Expected: FAIL.

- [ ] **Step 3: Update `myGamesRoutes.ts`**

Replace `isMyTurn: summary.isMyTurn` with `status: summary.status` in the per-game mapping (line 50). Replace the sort comparator (line 60):

```ts
const STATUS_PRIORITY: Record<'your-turn' | 'waiting' | 'recap', number> = { 'your-turn': 0, recap: 1, waiting: 2 };
const games = perGame
  .flat()
  .sort((a, b) => (STATUS_PRIORITY[a.status] !== STATUS_PRIORITY[b.status] ? STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] : b.createdAt - a.createdAt));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -w @denimcat/server -- myGames`
Expected: PASS.

- [ ] **Step 5: Update `packages/client/src/state/myGames.ts`**

`MyGame.status: 'your-turn' | 'waiting' | 'recap'` replaces `isMyTurn: boolean`.

- [ ] **Step 6: Update `packages/client/src/views/HomeView.tsx`**

Replace the badge logic at line 66-67 (`game.isMyTurn ? 'Your turn' : 'Waiting'`) with a 3-way switch on `status`, adding a `'recap'` case (e.g. "See how it ended" / similar, styled distinctly — reasonable implementer's call on exact copy and color, this isn't rules/marketing copy the designer needs to write). The `abandonable` button's existing conditional (`game.abandonable &&`) needs no change — Task 3 already made `abandonable` false once finished.

- [ ] **Step 7: Typecheck the client**

Run: `cd packages/client && npx tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/myGamesRoutes.ts packages/server/test/myGames.test.ts packages/client/src/state/myGames.ts packages/client/src/views/HomeView.tsx
git commit -m "Replace isMyTurn with a 3-way status, adding recap to the games list"
```

---

### Task 8: Client `isOwner` plumbing

**Files:**
- Modify: `packages/client/src/state/authToken.ts`
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/views/VerifyView.tsx`

**Interfaces:**
- Consumes: `isOwner` from `/auth/session` and `/auth/verify` (Task 5).
- Produces: `loadIsOwner(): boolean` (default `false`), `saveIdentity`'s signature grows to include it.

- [ ] **Step 1: Update `authToken.ts`**, mirroring `turnChimeEnabled`'s exact existing shape: a new `IS_OWNER_KEY = 'denimcat:auth:isOwner'`, `loadIsOwner(): boolean` (default `false`, same try/catch-and-default pattern as `loadTurnChimeEnabled`), `saveIdentity(email, displayName, turnChimeEnabled, isOwner)` (4 args now) writes the new key too, `clearIdentity` removes it too.

- [ ] **Step 2: Update every `saveIdentity(...)` call site** in `App.tsx` and `VerifyView.tsx` to pass the new `isOwner` value from whichever `/auth/session`/`/auth/verify` response it's already reading `turnChimeEnabled` from.

- [ ] **Step 3: Typecheck the client**

Run: `cd packages/client && npx tsc -p tsconfig.json --noEmit`
Expected: no errors (a stale 3-arg `saveIdentity` call site would fail here first).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/state/authToken.ts packages/client/src/App.tsx packages/client/src/views/VerifyView.tsx
git commit -m "Plumb isOwner through client session state"
```

---

### Task 9: `RecapPanel` and integration into all 5 games

**Files:**
- Create: `packages/client/src/components/RecapPanel.tsx`
- Modify: `packages/client/src/games/mint-condition/GameView.tsx`
- Modify: `packages/client/src/games/love-triangles/GameView.tsx`
- Modify: `private-games/other-games/client-hyperbloom/GameView.tsx`
- Modify: `private-games/other-games/client-tashkalar/GameView.tsx`
- Modify: `private-games/other-games/client-kingsgate/GameView.tsx`

**Interfaces:**
- Consumes: `STANDARD_SURVEY_QUESTIONS` (Task 2), `POST /survey-responses` (Task 6).
- Produces:
  ```ts
  export function RecapPanel({
    gameId,
    roomCode,
    mySeats,
    resultSummary,
  }: {
    gameId: string;
    roomCode: string;
    /** Every seat this account holds in this room — one survey form rendered per seat, same as a hotseat room's other per-seat UI. */
    mySeats: string[];
    /** Caller-supplied description of how the game ended (score, winner) — RecapPanel never inspects game state itself, same extension-point pattern ActivityPanel's renderLogText already uses. */
    resultSummary: ReactNode;
  }): JSX.Element;
  ```

- [ ] **Step 1: Implement `RecapPanel.tsx`**

Renders `resultSummary`, then one small form per entry in `mySeats`: `STANDARD_SURVEY_QUESTIONS` as text inputs/textareas, a Submit and a Skip-this-seat affordance (skip just doesn't render that seat's form again this session — there's nothing to persist for a skip, per Global Constraints). Submit does `fetch(`${SERVER_URL}/survey-responses`, { method: 'POST', headers: {Authorization: bearer, 'Content-Type': 'application/json'}, body: JSON.stringify({gameId, roomCode, seat, answers}) })` with the bearer token from `loadSessionToken()` (same pattern as `abandonMyGame` in `myGames.ts`); on success, that seat's form switches to a read-only "thanks" state. No test file — verify manually in Step 3.

- [ ] **Step 2: Wire into each game's `GameView.tsx`**

Each already renders some ad hoc "game over" text when its own finished-condition is true — find it (differs per game: check phase/gameOver fields) and replace it with `<RecapPanel gameId="<this game's literal id, matching its GameModule.id — e.g. 'tashkalar'>" roomCode={roomCode} mySeats={[mySeat]} resultSummary={<...>} />`, building `resultSummary` from whatever score/winner data that `GameView` already has in scope. (A seat here is virtually always a single value, not an array, outside hotseat — hotseat's "every seat this account holds" case is already handled by each `GameView` having a notion of which seats are "mine" in hotseat mode already, the same way the existing turn/action UI does; use that.)

- [ ] **Step 3: Manual verification**

Start the local dev server and client (see established convention this session), finish a game in each of the 5 games via hotseat, confirm: the recap panel replaces the normal play UI once finished, the result summary looks right, submitting an answer shows a thanks state and doesn't resubmit on reload, and a skipped question doesn't block submitting the others.

- [ ] **Step 4: Typecheck and build the client**

Run: `cd packages/client && npx tsc -p tsconfig.json --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/RecapPanel.tsx packages/client/src/games/mint-condition/GameView.tsx packages/client/src/games/love-triangles/GameView.tsx private-games/other-games/client-hyperbloom/GameView.tsx private-games/other-games/client-tashkalar/GameView.tsx private-games/other-games/client-kingsgate/GameView.tsx
git commit -m "Add shared RecapPanel; replace each game's ad hoc game-over UI with it"
```

(Submodule note: the `private-games/other-games/...` files live in a separate git submodule — commit and push there first, then bump the outer repo's submodule pointer in its own commit, per this session's established two-step pattern.)

---

### Task 10: Owner-only "Playtest notes" page

**Files:**
- Create: `packages/client/src/views/NotesView.tsx`
- Modify: `packages/client/src/App.tsx` (new route)
- Modify: each game's `HomeView.tsx` (5 files, same directories as Task 9) — conditional link

**Interfaces:**
- Consumes: `GET /survey-responses/:gameId` (Task 6), `loadIsOwner()` (Task 8).
- Produces: a route per game (e.g. `/<slug>/notes`), gated client-side on `loadIsOwner()` (server already enforces the real boundary in Task 6 — this is just UI, not security).

- [ ] **Step 1: Implement `NotesView.tsx`**

Fetches `GET /survey-responses/:gameId` with the bearer token, groups rows by `roomId` (first-seen order, which is already newest-first since the server returns `ORDER BY created_at DESC`), renders each room's `roomCode` as a heading with its question/answer pairs underneath. Deliberately minimal styling, per the design doc.

- [ ] **Step 2: Add the route in `App.tsx`**

Extend `Route`/`parseRoute()` with a `{ kind: 'game-notes'; slug: Slug }` matching `/^\/(hyperbloom|mint-condition|love-triangles|tashkalar|kingsgate)\/notes$/`, and a `NOTES_VIEWS` map (same shape as `HOME_VIEWS`) rendered from `renderRoute()`.

- [ ] **Step 3: Add the conditional link in each game's `HomeView.tsx`**

`{loadIsOwner() && <a href="/<slug>/notes">Playtest notes</a>}` (or equivalent) — reasonable placement call per existing page layout.

- [ ] **Step 4: Manual verification**

Submit a few survey answers across more than one room (via Task 9's flow), sign in as the owner account, confirm the notes page shows everything grouped correctly; confirm a non-owner account signed in doesn't see the link and a direct fetch gets rejected.

- [ ] **Step 5: Typecheck and build the client**

Run: `cd packages/client && npx tsc -p tsconfig.json --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/views/NotesView.tsx packages/client/src/App.tsx packages/client/src/games/mint-condition/HomeView.tsx packages/client/src/games/love-triangles/HomeView.tsx private-games/other-games/client-hyperbloom/HomeView.tsx private-games/other-games/client-tashkalar/HomeView.tsx private-games/other-games/client-kingsgate/HomeView.tsx
git commit -m "Add owner-only Playtest notes page per game"
```

---

### Task 11: Full verification and deploy

**Files:** none new — verification only.

- [ ] **Step 1: Run every package's test suite**

Run: `npm run test` (root, runs every workspace)
Expected: PASS, no regressions anywhere.

- [ ] **Step 2: Typecheck and build the client**

Run: `cd packages/client && npx tsc -p tsconfig.json --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 3: Manual end-to-end browser check**

Two-account async scenario (reuse this session's established scratch-socket-script pattern for simulating a second player if needed): finish a room with one account offline, confirm that account gets the game-over email (if they supplied one) and sees `recap` status on reload; confirm viewing it clears it; confirm the owner's notes page reflects it.

- [ ] **Step 4: Deploy**

`fly deploy -a denimcat-server` (this touches engine/server logic — a platform-only or client-only change would skip this, but this plan touches `packages/platform`/`packages/server` throughout). Verify `curl -s https://denimcat-server.fly.dev/health` and a real browser navigation to the production site afterward, per this session's established deploy-verification convention.
