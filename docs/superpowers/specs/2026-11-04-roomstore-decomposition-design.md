# RoomStore Decomposition — Design

**Spec source:** conversation during a "fresh eyes" audit of the denimcat
monorepo on 2026-11-04 — no separate designer-authored rules doc, since
this is a pure internal refactor with no user-visible behavior change.

## Intent

`packages/platform/src/rooms/roomStore.ts` is 947 lines, one `RoomStore`
class, and is the single most load-bearing file in the platform — every
game's join/reconnect/play/chat/idle-cleanup path runs through it. Its
size make it harder to safely change than it should be for how often it
actually needs changing (it was the site of three separate fixes/
investigations this session alone). The goal is to split it into
focused, single-responsibility files with no change in behavior or
public API.

## Goals

- Decompose `RoomStore`'s ~25 methods into cohesive, independently
  readable files grouped by concern.
- Zero behavior change: every game that constructs a `RoomStore` keeps
  working identically. The existing `packages/platform/test/roomStore.test.ts`
  (1174 lines, exercises `RoomStore` entirely through its public API)
  is the correctness oracle — it must pass unmodified, in full, after
  every task.
- `RoomStore`'s public API (every method's name, parameters, and return
  type) is unchanged.

## Non-goals

- No new functionality, no bug fixes bundled in (if a latent bug is
  spotted during extraction, note it and leave it — a separate concern).
- No change to `LiveRoom`, `PersistedRoom`, or any other type's shape.
- No change to `RoomStoreOptions` or the constructor's public signature.

## Constraints

- Follows CLAUDE.md's "prefer smaller, focused files" guidance.
- TDD throughout: the existing suite is the primary oracle; extraction
  tasks also fold in the one new regression test the design calls out
  below (see Review Focus).

## Approach

**Chosen: free functions + an explicit context object** (discussed and
picked over a composition/dependency-injection alternative — the
functional approach is the smaller, more mechanical diff, which matters
most here since the main risk is accidentally changing behavior, not
under-structuring the code).

Concretely:

- A new `RoomStoreContext<TState, TConfig, TSeat>` interface
  (`roomStoreContext.ts`) holds every piece of `RoomStore`'s current
  per-instance mutable state and constructor-injected dependencies as
  **plain data** — `cache`, `hydrating`, `socketBindings`, `graceTimers`
  (all four currently-private `Map`s), `module`, `repository`, `nsp`,
  and the resolved option values (`graceMs`, `idleTimeoutMs`,
  `idleTimeoutAfterRecapMs`, `emailSender`, `appBaseUrl`). No function
  members — every extracted group's functions live in their own file
  and import whatever sibling-group functions they call directly
  (plain module imports), rather than reaching for them through the
  context. This sidesteps the chicken-and-egg problem of trying to bind
  a context's own methods to itself during construction.
- Six new files, each exporting plain functions that take
  `(ctx: RoomStoreContext<...>, ...args)`:
  - `roomNotifications.ts` — `notifyTurn`, `notifyGameEnd`. No
    dependencies on any other extracted group (a leaf).
  - `roomCore.ts` — `createRoom`, `getRoom` (+ its private
    `hydrateRoom` helper), `persist`, `applyAction`. Imports
    `notifyTurn`/`notifyGameEnd` from `roomNotifications.ts`.
  - `roomBroadcast.ts` — `viewFor`, `broadcastState`, `buildRoomInfo`,
    `broadcastRoomInfo`, `getRoomInfo`, `resyncAfterJoin`. Imports
    `getRoom` from `roomCore.ts`.
  - `roomMembership.ts` — `joinRoom`, `reconnectRoom`,
    `reconnectByAccount`, `leaveSeat`, `handleDisconnect`,
    `startGraceTimer`, `clearGraceTimer`, `expireSeat`. Imports
    `getRoom`/`persist` from `roomCore.ts` and `viewFor`/
    `broadcastRoomInfo` from `roomBroadcast.ts`.
  - `roomIdleSweep.ts` — `sweepIdleRooms`,
    `isPermanentlyExemptFromSweep`, `recapFullyViewed`,
    `idleTimeoutFor`, `hasEverBeenClaimed`, `abandonRoom`,
    `isAbandonable`, `listOpenRoomsForAccount`. Imports `getRoom` from
    `roomCore.ts` and `clearGraceTimer` from `roomMembership.ts`.
  - `roomChat.ts` — `sendChatMessage` (+ its `MAX_CHAT_HISTORY`
    constant). Imports `getRoom`/`persist` from `roomCore.ts` and
    `broadcastRoomInfo` from `roomBroadcast.ts`.
- `roomStore.ts` keeps the `RoomStore` class itself, now a thin facade:
  the constructor builds one `RoomStoreContext` instance and keeps it
  as a single private field; `stop()` keeps its own tiny timer-cleanup
  logic (it's instance lifecycle, not room-domain logic, so it doesn't
  need extracting); every other public method becomes a one-line
  delegation, e.g. `async joinRoom(...) { return joinRoom(this.ctx, ...); }`.

This resolves to a one-directional import graph — `roomNotifications`
is the only leaf; `roomCore` depends only on it; `roomBroadcast` and
`roomMembership` depend on `roomCore` (and `roomMembership` also on
`roomBroadcast`); `roomIdleSweep` and `roomChat` depend on both of
those. No cycle anywhere, confirmed by reading every call site in the
current file.

## What's left to the builder

- Exact variable names inside each extracted function (signatures and
  behavior are pinned; local variable naming is the implementer's call).
- Whether `hydrateRoom` is exported from `roomCore.ts` or kept as a
  true module-private helper only `getRoom` calls — either is fine,
  it's never called from outside `roomCore.ts` today.
