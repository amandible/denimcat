# Adding a new game

A checklist for implementing a new game on the denimcat platform, derived
from how Hyper Bloom, Mint Condition, Love Triangles, Tash-Kalar, and
King's Gate are actually built — not aspirational, just what's there.
Follow `superpowers:brainstorming` → `superpowers:writing-plans` →
`superpowers:executing-plans` (or `subagent-driven-development`) for the
process; this doc is the implementation shape that process should produce
a plan for.

## Before any code

- The rules almost always start as a designer's own doc under
  `design/<game>/` (e.g. `design/mint-condition/rules.md`) — read it, and
  treat every gap in it as a question for the designer, never something to
  invent. See the root `CLAUDE.md`: board game rules and in-game text are
  hers to write, not Claude's to guess.
- **Public vs. private.** The designer's own original games (Mint
  Condition, Love Triangles — tagline says "by a_mandible") live in
  `packages/`, tracked in the main repo. Games based on someone else's
  published IP or another designer's game (Tash-Kalar's fan factions,
  Hyper Bloom "by shiobana") live in the `private-games/other-games`
  submodule (a separate private repo, `denimcat-nonpublic`) instead.
  Confirm which applies before scaffolding anything — it changes every
  path below (`private-games/other-games/engine-<game>` instead of
  `packages/engine-<game>`, etc.) and whether a commit needs the two-step
  submodule-then-pointer-bump pattern.
- Go through brainstorming → a written design doc → a plan before writing
  product code. A new game is always "a project," never a small change.

## Engine package (`packages/engine-<game>` or the private equivalent)

Pure game logic — no I/O, no sockets, no persistence. Files, by
convention (see `packages/engine-mint-condition` as the clearest public
example):

- `package.json` — name `@denimcat/engine-<game>`, `"private": true`,
  depends on `@denimcat/shared`. A **public** engine needs no workspace
  registration (the root `package.json`'s `"packages/*"` glob already
  covers it); a **private** engine must be added to the root
  `package.json`'s `workspaces` array explicitly (see the three
  `private-games/other-games/engine-*` entries there), plus a
  `test:engine-<game>` convenience script if you want one.
- `tsconfig.json` — `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }`
  (adjust the relative path for a private engine's deeper nesting).
- `src/types.ts` — the full internal state shape, including anything
  hidden (private hands, shuffled deck order). `SeatId`, `PlayerCount`
  (if variable), the raw `GameState`.
- `src/state.ts` — low-level helpers shared across actions:
  `pushLog(state, message)` (plain `${seat}`-interpolated strings — the
  engine is deliberately display-agnostic, see "Client package" below for
  where that gets resolved to a name), `cloneState`, `MAX_LOG_ENTRIES`.
- `src/setup.ts` — `dealGame(playerCount, rng?)` or equivalent, building
  the initial `GameState`. Accepting an optional `rng` (default
  `Math.random`) is what makes shuffling testable — pass a seeded fake in
  tests.
- One file per action/phase group (Mint Condition: `bidding.ts`,
  `scoring.ts`, `prizes.ts`, `decks.ts`) — each action is a pure function
  `(state, seat, ...args) => EngineResult<T>`.
- `src/result.ts` — the two constructors every action uses:
  `ok(state, data?)` → `{ ok: true, state, data }`,
  `err(code, message)` → `{ ok: false, error: { code, message } }`.
- `src/contract.ts` — the WIRE contract, separate from the internal
  `types.ts` truth:
  - `<Game>Config` (what `create_room` accepts)
  - `<Game>StateView` (and per-role sub-views) — the **redacted** shape
    actually sent to a viewer; only build per-viewer redaction if there's
    real hidden information (Mint Condition's blind deck draws; Hyper
    Bloom has none, so it skips `toView` entirely and `GameModule`
    defaults to a plain broadcast)
  - `toView(state, viewer: SeatId | 'spectator'): <Game>StateView`
  - `ClientToServerEvents extends RoomLifecycleClientToServerEvents<SeatId, Config, StateView>` with one line per game-specific action
  - `ServerToClientEvents = RoomLifecycleServerToClientEvents<SeatId, StateView>`
- `src/index.ts` — re-export everything the server/client actually need:
  `export * from './types'; export * from './engine'; export * from './contract';`
  plus explicit named exports for anything else (`pushLog`, etc.).
- `test/` — one `vitest` file per action/phase module, pure unit tests
  (no sockets, no server), plus `test/helpers.ts` for shared state
  builders (`makeState(overrides)` pattern). TDD throughout — see
  `superpowers:test-driven-development`.

## Server wiring (`packages/server/src/games/<game>/`)

- `module.ts` — implements `GameModule<State, Config, Seat>` from
  `@denimcat/platform` (`packages/platform/src/gameModule.ts` has the
  full interface with doc comments on every optional field — read it
  before filling this in): `id`, `displayName`, `namespace` (`/<game>`),
  `minSeats`/`maxSeats`, `parseConfig`, `seatsForConfig`,
  `createInitialState`, `registerHandlers`, optionally `toView`,
  `afterMutation` (only if the game needs extra per-seat pushes beyond
  the state broadcast, e.g. Hyper Bloom's `legal_moves` hints),
  `getActiveSeat` (powers async-play turn-notification emails and the
  "your turn" landing-page status — omit only if the concept doesn't
  apply), `isRoomFinished`, `roomUrlPath`.
- `gameHandlers.ts` — `registerXHandlers(socket, store)`: one
  `socket.on(eventName, ...)` per action, each validating its payload
  (reuse `isNonEmptyString` from `@denimcat/platform`, add game-specific
  checks in `validate.ts`) then calling
  `store.applyAction(roomCode, socket.id, (state, seat) => actionFn(state, seat, ...args))`,
  `.then(cb).catch(error => { console.error(...); cb({ok:false, error: INTERNAL_ERROR}) })`.
- `validate.ts` — small type-guard functions for this game's payload
  shapes (`isCardArray`, `isSlotIndex`, etc.).
- Register in `packages/server/src/index.ts`: import the state/config/seat
  types and the module, then
  `const xRepository = createDefaultRoomRepository<State, Seat>(); const xNsp = io.of(xModule.namespace); const xStore = new RoomStore(xModule, xRepository, xNsp, roomStoreOptions); attachSocketHandlers(xNsp, xStore, xModule); gameStores.push({ module: xModule, store: xStore });`
- `packages/server/package.json` needs `@denimcat/engine-<game>: "*"`
  added to dependencies, then `npm install` at the repo root so the
  workspace symlink exists.

## Client package (`packages/client/src/games/<game>/` or the submodule equivalent)

- `seats.ts` — a plain **position-only** `seatLabel(seat): string`
  (`"Player 1"`, `"Red"`, or whatever this game's position concept is —
  never a player's name; see `[[project_player_naming_consistency]]`'s
  memory notes) and `CANDIDATE_SEATS: SeatId[]` (the max-size seat list,
  used before a room's actual seat list is known).
- `use<Game>Actions.ts` — wraps `useRoomConnection<StateView>(gameSlug, namespace, roomCode, options)`
  from `../../state/useRoomConnection`, adds one `useCallback` per action
  calling `connection.sendAction(eventName, payload)`, returns
  `{ ...connection, ...actions }`. Export the return type as
  `<Game>Connection`.
- `GameView.tsx` — the main board UI. Needs, per the now-established
  naming convention: a `displayLabel(seat)` closure combining
  `playerLabel` (from `packages/client/src/playerLabel.ts`) with
  `roomInfo?.seats[seat]?.name` and the plain `seatLabel`; a `displayLog`
  built via `substituteSeatTokens` (same file) to resolve raw seat ids
  the engine baked into log text; a `<RecapPanel gameId roomCode mySeat
  myPositionLabel resultSummary>` once the game ends, with
  `myPositionLabel={mySeat ? seatLabel(mySeat) : undefined}`; an
  `<ActivityPanel log={displayLog} chatMessages seatLabel={seatLabel} onSend>`
  (the `seatLabel` prop there must stay position-only — ActivityPanel
  combines it with the chat message's own name itself).
- `HomeView.tsx` — room creation (player-count picker if variable,
  `create_room`/hotseat/room-code-join UI) and the owner-only
  `{loadIsOwner() && <a href="/<game>/notes">Playtest notes</a>}` link.
  The tagline shown on the landing page is the designer's own words —
  use `TODO: <Game> description` and ask, never invent one (see
  `[[feedback_placeholder_marketing_copy]]`).
- `<Game>Room.tsx` — the top-level router: checks `?hotseat=1` and
  routes to `<HotseatRoom useActions candidateSeats seatLabel GameView getTurnSeat>`,
  else calls `use<Game>Actions(roomCode)` directly and renders
  `<LobbyView>` while `status === 'picking-role'`, else `<GameView>`.
  Also wires `useDocumentTitle` and `useTurnChime`.
- `components/` — a `ScoreBoard` (takes a `displayLabel` prop, not its
  own `seatLabel` import — GameView computes it once and passes it
  down), a `RulesContent` component **transcribed close to the design
  doc's own wording** (trim only non-player-facing asides like a dated
  "rules are in flux" disclaimer — this is an explicit, repeated
  designer preference, not a one-off), plus whatever action-specific
  panels the game needs.
- `styles/<game>.css` if the board needs bespoke layout, imported from
  `<Game>Room.tsx`.
- Register in `packages/client/src/App.tsx` (five separate edits, easy to
  miss one): add the slug to the `Slug` union type; add it to all three
  route regexes (`roomMatch`, `notesMatch`, `gameMatch`); add the
  `HomeView` to `HOME_VIEWS`; add the `Room` component to whatever map
  renders rooms.
- Register in `packages/client/src/games/registry.ts`: `{ slug, displayName, namespace, tagline }` — this is what makes the game appear on the landing page's game-select list. Omit entirely (comment explaining why, see King's Gate) for a built-but-not-yet-promoted game.
- `packages/client/package.json` needs `@denimcat/engine-<game>: "*"`
  added, then `npm install`.

## Testing

- Engine: pure `vitest` unit tests per module, no server/sockets
  involved. TDD (RED → GREEN) throughout.
- Server: `packages/server/test/<game>.gameplay.test.ts` — spins up a
  real `http.Server` + `socket.io` `Server`, connects real
  `socket.io-client` sockets, exercises the actual event contract
  end-to-end (`create_room` → `join_room` → actions → assertions on the
  acked response and/or `store`'s state). This is the layer that catches
  wiring mistakes the engine's own unit tests can't see.
- Client: **no test runner exists in this codebase.** Verify with
  `npx tsc -p tsconfig.json --noEmit` and `npx vite build` in
  `packages/client`, then an actual manual pass in a browser (local dev
  server, `DATABASE_URL=""` to force safe in-memory storage — see any
  recent session's dev-server setup for the exact incantation) before
  calling client work done. Say explicitly which surfaces were
  live-verified vs. only typechecked/built if you didn't get to all of
  them.

## Shipping

- Platform/server changes (new engine, new routes, new `GameModule`) need
  `fly deploy -a denimcat-server`; client-only changes auto-deploy via
  Vercel on push. Verify with `curl -s https://denimcat-server.fly.dev/health`
  and/or a real browser navigation to the production URL afterward.
- A private-submodule game's commits go in two steps: commit + push
  inside `private-games/other-games` first, then commit the outer repo's
  updated submodule pointer (and anything in `packages/` that changed
  alongside it, like `App.tsx`/`registry.ts`) second.
