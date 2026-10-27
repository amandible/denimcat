# Post-game recap: result visibility + playtest feedback

## Intent and why

Two problems the designer (the only owner/admin of this platform) raised
about using denimcat for playtesting:

1. There's no way to ask players (including the designer, testing solo)
   how a game felt once it's over — what was fun, what wasn't, what's
   memorable. This feedback is the whole point of running playtests here.
2. In async play, a game that ends on someone else's turn just vanishes
   from that player's "Your games" list the moment `isRoomFinished` goes
   true (`RoomStore.listOpenRoomsForAccount` currently `continue`s right
   past a finished room) — so a player who wasn't online when the game
   concluded may never learn how it ended.

Both turn out to share one piece: a shared **recap panel**, shown in
place of a finished room's normal play UI, that shows the final result
and asks a few optional feedback questions. An email and a persistent
list status both just point at it.

## Goals

- A player who missed a game's ending can find out how it ended, via
  email (if they opted into email for that room) and via their "Your
  games" list, which keeps a now-finished room visible with a distinct
  status until they've looked at it.
- Every player who held a seat, including the designer running a solo
  hotseat playtest, can optionally answer a small fixed set of
  feedback questions when a game ends.
- The designer can review everyone's answers for a given game, across
  every room ever played, in one simple page — this is the actual
  payoff: a running record to iterate the design against.

## Non-goals (for this round)

- Per-game custom questions — v1 ships one fixed, cross-game question
  set. (Worth revisiting once there's a reason to vary it per game.)
- Splitting "tech/site" feedback (visible to the site owner) from
  "playtest" feedback (visible to a game's own designer) — the
  designer floated this as a future direction once denimcat might host
  other people's games, but explicitly said not to build it now. Every
  answer is owner-only for now.
- Auto-expiring or dismissing a recap status — it stays on the list
  until viewed, full stop. A timeout or a dismiss button (mirroring
  the existing Abandon button) is a later addition, not part of this.
- Editing a submitted answer, or asking again after the fact — a
  recap panel shows what was already submitted, read-only, once
  answered.

## Anti-goals

- Don't make the feedback form feel mandatory. Every question is
  skippable; viewing the recap (which is what clears the list status)
  must not require submitting anything.
- Don't block or delay the acting player's own turn to send any of
  this — the existing turn-notification email is fire-and-forget for
  exactly this reason, and the game-over email should follow the same
  pattern.

## Constraints

- No role/permission system exists anywhere in denimcat today —
  `OWNER_EMAIL` currently only routes a notification, it's never used
  to gate a page or route. This is the first owner-only surface.
- `rooms` is a single JSONB blob per room, with no durable identity
  once a room is deleted (see `admin-delete-room.ts`, already written
  this session for force-closing stuck rooms). Anything meant to
  outlive a room can't live inside it.
- Every game's `GameModule` is otherwise ignorant of the others —
  cross-game aggregation (goal 3) has to happen at a layer above any
  individual `RoomStore`.

## Approaches considered

The one real fork: **where do survey answers live?**

1. **Inside the room's own JSONB blob**, alongside `chatMessages` and
   `knownNames` — no new table, fits the existing "a room is one blob"
   philosophy (see `PostgresRoomRepository`'s own doc comment: no
   normalized schema because there's no query need beyond "get room by
   code"). Rejected: this directly breaks the stated goal. Rooms get
   deleted (abandoned, or via the admin script), and even one that
   isn't ever gets excluded from `listOpenRoomsForAccount` the moment
   it's finished — there'd be no way to ask "show me every answer ever
   given for Tash-Kalar" without first reconstructing which rooms ever
   existed.
2. **A new `survey_responses` table**, independent of any room's
   lifecycle — `game_id`, `room_code` (for traceability only, not a
   live reference), `seat`, `account_email`, `question_id`, `answer`,
   `created_at`. Matches this schema's existing shape: `accounts`,
   `magic_links`, `sessions` are already small standalone tables
   alongside `rooms`, not folded into it. A straightforward
   `CREATE TABLE IF NOT EXISTS` via the same `ensureSchema()` pattern
   every other table already uses.

**Picked: 2.** Confirmed with the designer ("new table is the right
move").

The "have I seen this room's recap yet" flag is a different kind of
data — it only matters while the room is still around, exactly like
`abandonable`'s own per-seat bookkeeping — so it stays in the room
blob (`recapViewedBy`, new field). Unlike `knownAccounts`, it's keyed
by account email directly rather than by seat — see "a human player,
not a seat" below for why. No fork needed on *where* this lives;
noted here so it's clear not everything new went into the table.

## Design

### Data model

New table (`packages/platform/src/db/client.ts`, same `ensureSchema()`
pattern as every other table):

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

**Builder-check caught a real bug here, settled rather than asked
back**: 4-character room codes (`roomCode.ts`) come from a ~1M-value
alphabet, and `createRoom`'s collision check only looks at *currently
existing* rooms — a deleted room's code is immediately free for reuse.
Using `room_code` alone as the uniqueness/grouping key would silently
merge a long-gone room's answers with an unrelated future room that
happened to land on the same recycled code, directly undermining goal
3 ("a running record... across every room ever played"). Fixed by
adding `room_id` — a UUID minted once in `createRoom` and persisted
into `PersistedRoom`/`LiveRoom` (new field, never displayed, exists
purely as a durable identity that survives the human-readable code
being reused). `room_id` is the real identity for uniqueness and the
notes view's grouping; `room_code` stays only for display (so the
designer can recognize "oh, that was the Tuesday game"). The unique
index is `(room_id, seat, question_id)`.

No foreign key to `rooms` — `room_code`/`room_id` are kept for
traceability (which playtest session this came from) but a response
must survive its room being deleted.

Every seat reaching a room is always tied to a signed-in account —
the whole app sits behind the magic-link sign-in gate (`SignInGate` in
`App.tsx`), and every game namespace's socket middleware already
rejects an unauthenticated connection before `join_room` can even
fire. `knownAccounts`/`knownEmails` being `Partial` reflects "has this
seat been joined by anyone yet," not "was the joiner anonymous" — so
`account_email NOT NULL` is safe and doesn't need a new sign-in gate
of its own.

#### A human player, not a seat

**Corrected after the designer read this section**: `recapViewedBy`
is keyed by **account email**, not by seat. The original draft keyed
it by `TSeat` (mirroring `knownAccounts`) and required every seat an
account holds to be individually marked — which falls apart for a
hotseat room, where one human plays every seat. The recap is something
a *person* has or hasn't seen, not something tracked per seat they
happened to occupy; a hotseat player's one visit to the room should
clear the whole thing, full stop. (The survey form underneath is still
asked once per seat held, since different seats can genuinely have
different things to say about the game — that's unrelated to this
flag, which is purely "has this person looked at the result yet.")

Room-blob addition (`PersistedRoom`/`LiveRoom` in
`packages/platform/src/rooms/roomRepository.ts` / `roomStore.ts`):

```ts
recapViewedBy?: Record<string, true>; // account email -> viewed
```

### Triggering the recap (server)

`RoomStore.applyAction` already diffs `GameModule.getActiveSeat`
before/after each mutation to fire the existing turn-notification
email (`notifyTurn`). A new `notifyGameEnd` follows the identical
shape, diffing `GameModule.isRoomFinished` instead: fires once, the
instant a room flips from not-finished to finished, to every seat with
a `knownEmails` entry (same per-seat opt-in the turn email already
uses — no new preference to build). Subject along the lines of "Game
over in {displayName} — see how it ended", linking to the room's
existing URL (same `roomUrlPath` + seat-token link-building `notifyTurn`
already does).

No new route for the recap itself — the existing room URL already
carries reconnect semantics. Two distinct moments mark an account's
`recapViewedBy` entry, not just one — **builder-check caught that the
design only covered the reconnect case**, missing the far more common
one (synchronous play, where people are sitting in the room together
when the game ends):

1. **Already-connected accounts, at the moment the game ends.** The
   new `notifyGameEnd` (below) fires inside the same `applyAction`
   that just made `isRoomFinished` go true — at that point `RoomStore`
   already knows, via the same `socketBindings` it uses to route
   `broadcastState`, exactly which accounts are live right now. Anyone
   watching the game conclude live has, by definition, already seen
   it — so `notifyGameEnd` also marks `recapViewedBy[email] = true`
   for every currently-connected account, not just the ones it's
   emailing.
2. **Not-connected accounts, on their next arrival.** For everyone
   else — the actual async-play case this feature exists for — the
   original plan stands: `joinRoom` (roomStore.ts:226), `reconnectRoom`
   (roomStore.ts:274), and `reconnectByAccount` (roomStore.ts:324)
   backfill `recapViewedBy[email] = true` on arrival into an already-
   finished room, the same place they already backfill `knownNames`/
   `knownAccounts`.

Either way, marking viewed never depends on submitting (or skipping)
any survey answer — opening/watching the room is what counts as the
one visit, regardless of how many seats that account holds there.

### "Your games" list

`RoomStore.listOpenRoomsForAccount` (roomStore.ts:580) currently does:

```ts
if (this.module.isRoomFinished?.(room.gameState)) continue;
```

This becomes a status instead of a skip:

```ts
status: this.module.isRoomFinished?.(room.gameState)
  ? (room.recapViewedBy?.[email] ? 'done' : 'recap')
  : (activeSeat !== null && mySeats.includes(activeSeat) ? 'your-turn' : 'waiting')
```

A room drops off the list the moment that account has viewed it once
(`'done'`) — one visit, regardless of how many seats the account
holds, including every seat in a hotseat room. `OpenGameSummary.abandonable`
stops applying once a room is finished (an ended game isn't
"abandoned," it's over) — the client shows a different action there.

Sort order: `'recap'` sorts with (or just behind) `'your-turn'` — it's
the other genuinely actionable state, a result is waiting to be seen.

### Recap panel (client)

New shared component, `packages/client/src/components/RecapPanel.tsx`
— same role `ActivityPanel` already plays for logs/chat: one
implementation, used by all 5 games' `GameView.tsx`, replacing each
game's own ad hoc "game over" text. Each `GameView` already has
whatever it needs to describe the final result (score, winner) from
its own `gameState`/`toView` — `RecapPanel` takes that as a prop
(`resultSummary: ReactNode`), same extension-point pattern
`ActivityPanel`'s `renderLogText` already uses, rather than trying to
understand any particular game's state shape itself.

Below the result, the fixed question set (see below) renders as a
simple optional form — Submit or Skip, one bulk submission per seat
held (a hotseat player holding 3 seats gets 3 short forms, one per
seat, since different seats may have genuinely different things to
say — e.g. a specific faction felt unbalanced). Already-answered
questions (per the unique index above) render as read-only text
instead of a form.

**Builder-check flagged that "Skip" was underspecified**: a skipped
question leaves no row, so nothing stops it resurfacing as an open
form on a later visit — which would read as nagging, directly against
the stated anti-goal. Settled by tying the form's visibility to the
same one-visit window `recapViewedBy` already describes, rather than
adding a separate "skipped" record to the schema: the survey form
(for any question not yet answered) only renders while
`recapViewedBy[email]` is still unset for that account — i.e. during
the one visit the list status describes. Once that flips true (per the
previous section, either by watching live or by this very visit), a
later visit to the same finished room still shows the result, but
never re-offers the form — answered, skipped, or simply not reached,
all treated the same: that was the one chance. No new schema needed.

### Standard question set

TODO: designer to write the actual question text — per this project's
own standing instruction not to invent this kind of copy. A starting
shape (ids stable so future wording tweaks don't orphan old answers):

```ts
export const STANDARD_SURVEY_QUESTIONS = [
  { id: 'fun', text: 'TODO: question text' }, // e.g. what was fun
  { id: 'not-fun', text: 'TODO: question text' }, // e.g. what wasn't
  { id: 'memorable', text: 'TODO: question text' }, // e.g. what was memorable
];
```

### Owner-gated notes view

`AuthService.checkSession`/`verifyToken` (`packages/platform/src/auth/authService.ts`)
gain one more field, `isOwner: boolean` — `email === ownerEmail`,
computed the same place the existing new-account-notification check
already compares against it. The client conditionally renders a
"Playtest notes" link (from each game's own home screen) only when
`isOwner` is true; the server route backing it (new
`GET /games/:gameId/survey-responses`, same owner check — never trust
the client-side conditional alone) 403s for anyone else.

The view itself (`packages/client/src/views/NotesView.tsx`, one route
per game): every `survey_responses` row for that `game_id`, grouped by
`room_id` (displayed to the designer via its `room_code`), newest room
first. Explicitly not styled beyond basic readability — the designer
was clear this doesn't need to be pretty, just all in one place.

## Calls made after builder review

A fresh-eyes review of this doc caught four real gaps; all four were
settled here rather than sent back as questions, since the goals/
anti-goals already in this doc pointed to a clear answer each time.
Worth a second look while reading, in case any read differently than
intended:

1. **Room identity**: added `room_id` (a UUID, new) as the real
   identity for survey rows, since 4-character room codes get
   recycled once a room is deleted — `room_code` alone would have let
   an unrelated future room's answers collide with a long-gone one's.
2. **Guest seats**: `account_email NOT NULL` is fine as originally
   written — the whole app already requires sign-in before a room is
   reachable at all, so this isn't a new restriction.
3. **Marking a room's recap "viewed"**: added a second trigger
   (`notifyGameEnd` marks every account connected *at the moment the
   game ends*, not just accounts that later reconnect) — the original
   design only covered async play and would have left live/
   synchronous players' list entries stuck on "recap" forever.
4. **Skip semantics**: a skipped question doesn't get its own schema
   record — the survey form simply never reappears once
   `recapViewedBy[email]` is true (answered, skipped, or just not
   reached, all treated alike), so "don't nag" holds without new state.
5. **Per-player, not per-seat** (caught by the designer after
   reading): `recapViewedBy` is keyed by account email, not by seat —
   see "A human player, not a seat" above. The original draft would
   have required a hotseat player to have every one of their seats
   separately marked viewed, when really one visit from one person
   should clear the whole room regardless of how many seats they hold.

## What's left to the builder

- Exact copy for the standard questions (TODO above — designer to
  supply before or during implementation).
- Whether `RecapPanel`'s result-summary prop is free-form `ReactNode`
  or something more structured per game — left as an implementation
  call once each `GameView`'s existing end-of-game text is looked at
  directly, since some may already have something reusable.
- Table/route naming is this doc's proposal, not gospel — fine to
  adjust once writing the actual migration/routes if something fits
  this codebase's conventions better.
