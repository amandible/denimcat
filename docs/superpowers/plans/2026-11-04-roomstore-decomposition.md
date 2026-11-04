# RoomStore Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `packages/platform/src/rooms/roomStore.ts` (947 lines, one class) into six focused files of plain functions plus a thin facade class, with zero behavior change.

**Architecture:** A `RoomStoreContext` interface holds all of `RoomStore`'s current per-instance mutable state as plain data (no function members). Six new files export plain functions taking that context as their first argument, grouped by concern (core, notifications, broadcast, membership, idle-sweep, chat). `RoomStore` itself becomes a thin facade: builds one context in its constructor, delegates every public method to the matching imported function.

**Tech Stack:** TypeScript, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-roomstore-decomposition-design.md`

## Global Constraints

- Zero behavior change — `RoomStore`'s public API (method names, parameters, return types) is unchanged.
- The existing `packages/platform/test/roomStore.test.ts` must pass, unmodified, after every task.
- No new functionality and no unrelated bug fixes — if something looks like a latent bug during extraction, leave a one-line comment noting it and move on.
- Import graph is one-directional: `roomNotifications` (leaf) ← `roomCore` ← `roomBroadcast`, `roomMembership` ← `roomIdleSweep`, `roomChat`. Never import "backwards" against this order.

## Review Focus

- **`applyAction`'s persist-after-notifyGameEnd ordering.** The current code calls `notifyGameEnd(room, previousState)` (which mutates `room.recapViewedBy` directly) *before* `await this.persist(room)`, specifically so that mutation is actually saved (see the comment at roomStore.ts:485-490). A refactor that reorders these two calls would silently stop persisting a just-finished room's `recapViewedBy` backfill. The existing test suite checks `recapViewedBy` by reading back through `store.getRoom(code)`, which reads the in-memory cache — that would still pass even if persistence silently broke. Task 2 adds one test that reads the **repository** directly to close this gap.
- **`sweepTimer.unref()` and per-timer `.unref()` on grace timers.** Both currently call `.unref?.()` so they never keep the Node process alive on their own (important for both the real server's graceful shutdown and for tests, which construct many `RoomStore`s). Easy to drop silently when moving the `setInterval`/`setTimeout` calls into a new file. Task 1 and Task 4 both check for this explicitly.
- **Grace-timer map key format (`` `${code}:${role}` ``).** `startGraceTimer`/`clearGraceTimer`/`expireSeat` all key `graceTimers` by this exact composed string. Must stay identical since nothing else about the behavior is changing.
- **`hydrateRoom`'s backward-compatibility backfill** (knownEmails/knownNames seeded from `seats[...].email`/`.name` for a room persisted before those fields existed) is easy to lose by assuming `persisted.knownEmails` alone is authoritative. Task 1 keeps the exact merge order from the source.
- **The `hydrating` de-dupe map.** `getRoom` must still de-dupe concurrent hydration of the same uncached code (see `roomStore.test.ts`'s "RoomStore concurrent hydration" describe block) — this is already covered by an existing test, but it's the one piece of `roomCore.ts` with a subtle invariant (the `Map.delete` in `.finally()` must still run even if hydration fails) worth double-checking against, not re-deriving from the method signature alone.

---

### Task 1: Context type, `roomNotifications.ts`, and `roomCore.ts`

**Files:**
- Create: `packages/platform/src/rooms/roomStoreContext.ts`
- Create: `packages/platform/src/rooms/roomNotifications.ts`
- Create: `packages/platform/src/rooms/roomCore.ts`
- Modify: `packages/platform/src/rooms/roomStore.ts` (constructor builds the context; `createRoom`, `getRoom`, `applyAction` delegate to the new `roomCore.ts`; the private `persist`/`hydrateRoom` methods are removed)
- Test: `packages/platform/test/roomStore.test.ts` (run only, no edits), `packages/platform/test/roomCore.test.ts` (new)

**Interfaces:**
- Produces: `RoomStoreContext<TState, TConfig, TSeat>` (exported interface: `module`, `repository`, `nsp`, `cache: Map<string, LiveRoom<TState, TSeat>>`, `hydrating: Map<string, Promise<LiveRoom<TState, TSeat> | null>>`, `socketBindings: Map<string, SocketBinding<TSeat>>`, `graceTimers: Map<string, NodeJS.Timeout>`, `graceMs: number`, `idleTimeoutMs: number`, `idleTimeoutAfterRecapMs: number`, `emailSender: EmailSender`, `appBaseUrl?: string`). `LiveRoom`, `LiveSeat`, and `SocketBinding` move from `roomStore.ts` into `roomStoreContext.ts` too (every extracted file needs them; `roomStore.ts` re-exports or imports them back as needed).
- Produces (`roomNotifications.ts`): `notifyTurn<TState, TConfig, TSeat extends string>(ctx: RoomStoreContext<TState, TConfig, TSeat>, room: LiveRoom<TState, TSeat>, previousState: TState): void`, `notifyGameEnd(ctx, room, previousState): void` — same two functions, verbatim logic, from roomStore.ts:518-589.
- Produces (`roomCore.ts`): `createRoom(ctx, rawConfig: unknown): Promise<{ok:true; roomCode:string} | {ok:false; error:{code:string; message:string}}>`, `getRoom(ctx, code: string): Promise<LiveRoom<TState,TSeat> | null>`, `persist(ctx, room: LiveRoom<TState,TSeat>): Promise<void>`, `applyAction(ctx, code: string, socketId: string, action: (state: TState, seat: TSeat) => EngineResult<TState, any>): Promise<ActionResult>` — verbatim logic from roomStore.ts:158-247 (createRoom, getRoom, private hydrateRoom) and :455-493 (applyAction) and :809-831 (persist). `applyAction` imports `notifyTurn`/`notifyGameEnd` from `roomNotifications.ts`.
- Consumes: nothing from other new files (this task is the dependency base).

- [ ] **Step 1: Create `roomStoreContext.ts`** — move the `LiveSeat`, `LiveRoom`, `SocketBinding` type definitions out of `roomStore.ts` verbatim, then add the new exported `RoomStoreContext<TState, TConfig, TSeat>` interface as described above.

- [ ] **Step 2: Create `roomNotifications.ts`** — move `notifyTurn` and `notifyGameEnd` verbatim out of `roomStore.ts`, converting every `this.` reference to `ctx.` (e.g. `this.module` → `ctx.module`, `this.emailSender` → `ctx.emailSender`, `this.appBaseUrl` → `ctx.appBaseUrl`). Keep both functions' doc comments.

- [ ] **Step 3: Create `roomCore.ts`** — move `createRoom`, `getRoom`, the private `hydrateRoom` helper, `persist`, and `applyAction` verbatim out of `roomStore.ts`, same `this.` → `ctx.` conversion. `applyAction` imports and calls `notifyTurn`/`notifyGameEnd` from `roomNotifications.ts` in place of `this.notifyTurn`/`this.notifyGameEnd` — keep the exact call order (notifyTurn, then notifyGameEnd, then `await persist(ctx, room)` — see this task's Review Focus item on ordering).

- [ ] **Step 4: Write the ordering regression test** in `packages/platform/test/roomCore.test.ts`:

```typescript
it('persists recapViewedBy after a game-ending action, not just in the in-memory cache', async () => {
  // module.isRoomFinished returns true after the action; seat is connected
  // with a known account. Build ctx via a real RoomStore + repo (same
  // fixture helpers as roomStore.test.ts: makeModule/fakeNamespace/seedRepo),
  // call applyAction with an action that finishes the game, then read the
  // room back from the REPOSITORY directly (repo.get(code)), not through
  // store.getRoom — assert the persisted snapshot's recapViewedBy[account] is true.
});
```

- [ ] **Step 5: Run the new test to verify it fails for the right reason**

Run: `npm run test -w @denimcat/platform -- roomCore`
Expected: FAIL — `roomCore.ts` doesn't exist yet, or (once Steps 1-3 are done) the test fails only if Step 3's ordering was gotten wrong; if Steps 1-3 are already done correctly this test should already pass — in that case this step confirms it passes for the right reason (reads via the repository, not the cache) rather than being a tautology. If it passes trivially without exercising the repository read, fix the test, not the code.

- [ ] **Step 6: Update `roomStore.ts`** — in the constructor, build `this.ctx: RoomStoreContext<TState, TConfig, TSeat>` from the existing fields (same defaults/options resolution as today), replacing the individual private fields (`cache`, `hydrating`, `socketBindings`, `graceTimers`, `graceMs`, `idleTimeoutMs`, `idleTimeoutAfterRecapMs`, `emailSender`, `appBaseUrl`, `module`, `repository`, `nsp`) with that one context field. `sweepTimer` is NOT part of the context (nothing outside `stop()` and the constructor ever touches it) — it stays its own private field on the class, unchanged. Replace `createRoom`, `getRoom`, `applyAction` method bodies with one-line delegations to the imported functions, passing `this.ctx`. Delete the now-moved private `hydrateRoom`/`persist` methods. Every other method or field access that isn't extracted yet — every still-inline private method (`joinRoom`, `reconnectRoom`, `reconnectByAccount`, `leaveSeat`, `handleDisconnect`, `notifyTurn`/`notifyGameEnd` call sites inside the now-moved `applyAction` excepted, `viewFor`, `resyncAfterJoin`, `broadcastState`, `buildRoomInfo`, `broadcastRoomInfo`, `getRoomInfo`, `listOpenRoomsForAccount`, `isAbandonable`, `abandonRoom`, `startGraceTimer`, `clearGraceTimer`, `expireSeat`, `hasEverBeenClaimed`, `isPermanentlyExemptFromSweep`, `recapFullyViewed`, `idleTimeoutFor`, `sweepIdleRooms`, `sendChatMessage`), plus `stop()` and the constructor's own `setInterval(() => this.sweepIdleRooms()...)` call site — all still reference `this.module`/`this.cache`/`this.graceTimers`/etc. directly today; update every one of those references to `this.ctx.module`/`this.ctx.cache`/`this.ctx.graceTimers`/etc. so the file still compiles. This is a mechanical find-and-replace across the whole file, not a behavior change — full delegation of these still-inline methods to their own extracted files happens in Tasks 2-5.

- [ ] **Step 7: Run the full platform suite to verify nothing broke**

Run: `npm run test -w @denimcat/platform`
Expected: PASS, all files including the new `roomCore.test.ts`.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck -w @denimcat/platform`
Expected: PASS, no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/platform/src/rooms/roomStoreContext.ts packages/platform/src/rooms/roomNotifications.ts packages/platform/src/rooms/roomCore.ts packages/platform/src/rooms/roomStore.ts packages/platform/test/roomCore.test.ts
git commit -m "refactor: extract RoomStore context, notifications, and core into separate files"
```

---

### Task 2: `roomBroadcast.ts`

**Files:**
- Create: `packages/platform/src/rooms/roomBroadcast.ts`
- Modify: `packages/platform/src/rooms/roomStore.ts`
- Test: `packages/platform/test/roomStore.test.ts` (run only)

**Interfaces:**
- Consumes: `getRoom` from `roomCore.ts` (Task 1), `RoomStoreContext`/`LiveRoom` types from `roomStoreContext.ts` (Task 1).
- Produces: `viewFor(ctx, room, viewer: TSeat | 'spectator'): unknown`, `broadcastState(ctx, room, data?: unknown): void`, `buildRoomInfo(ctx, room): RoomInfo<TSeat>`, `broadcastRoomInfo(ctx, room): void`, `getRoomInfo(ctx, code: string): Promise<RoomInfo<TSeat> | null>`, `resyncAfterJoin(ctx, code: string): Promise<void>` — verbatim from roomStore.ts:591-680 (`viewFor` through `getRoomInfo`) and :612-615 (`resyncAfterJoin`, in its original position before `broadcastState` in the source — order in the new file doesn't matter).

- [ ] **Step 1: Create `roomBroadcast.ts`** — move `viewFor`, `resyncAfterJoin`, `broadcastState`, `buildRoomInfo`, `broadcastRoomInfo`, `getRoomInfo` verbatim, `this.` → `ctx.` conversion, importing `getRoom` from `./roomCore.js` where `resyncAfterJoin`/`getRoomInfo` need it.

- [ ] **Step 2: Update `roomStore.ts`** — replace `viewFor`, `resyncAfterJoin`, `broadcastState`, `buildRoomInfo`, `broadcastRoomInfo`, `getRoomInfo` method bodies with one-line delegations. Delete the now-moved private method bodies. Any remaining un-extracted method (joinRoom, etc.) that called `this.viewFor(...)`/`this.broadcastRoomInfo(...)` now calls the imported `viewFor(this.ctx, ...)`/`broadcastRoomInfo(this.ctx, ...)` directly, OR keeps calling `this.viewFor(...)` if that delegation already exists from Step 2 — either is fine as long as it compiles and behaves identically; prefer calling the imported function directly to avoid an unnecessary extra hop.

- [ ] **Step 3: Run the full platform suite**

Run: `npm run test -w @denimcat/platform`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w @denimcat/platform`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/rooms/roomBroadcast.ts packages/platform/src/rooms/roomStore.ts
git commit -m "refactor: extract RoomStore's broadcasting/view-building into roomBroadcast.ts"
```

---

### Task 3: `roomMembership.ts`

**Files:**
- Create: `packages/platform/src/rooms/roomMembership.ts`
- Modify: `packages/platform/src/rooms/roomStore.ts`
- Test: `packages/platform/test/roomStore.test.ts` (run only)

**Interfaces:**
- Consumes: `getRoom`, `persist` from `roomCore.ts` (Task 1); `viewFor`, `broadcastRoomInfo` from `roomBroadcast.ts` (Task 2).
- Produces: `joinRoom(ctx, code, role, socketId, email?, name?, accountEmail?): Promise<JoinResult<TSeat, unknown>>`, `reconnectRoom(ctx, code, role, seatToken, socketId, accountEmail?): Promise<JoinResult<TSeat, unknown>>`, `reconnectByAccount(ctx, code, accountEmail, socketId, fallbackName?): Promise<JoinResult<TSeat, unknown>>`, `leaveSeat(ctx, code, socketId): Promise<void>`, `handleDisconnect(ctx, socketId): Promise<void>`, `startGraceTimer(ctx, code, role): void`, `clearGraceTimer(ctx, code, role): void`, `expireSeat(ctx, code, role): Promise<void>` — verbatim from roomStore.ts:249-448 (joinRoom through handleDisconnect) and :833-862 (startGraceTimer through expireSeat).

- [ ] **Step 1: Create `roomMembership.ts`** — move all eight functions verbatim, `this.` → `ctx.` conversion. `expireSeat` currently calls `this.graceTimers.delete(...)`, `this.cache.get(...)`, `this.persist(...)`, `this.broadcastRoomInfo(...)` — becomes `ctx.graceTimers.delete(...)`, `ctx.cache.get(...)`, `persist(ctx, ...)` (imported from `roomCore.ts`), `broadcastRoomInfo(ctx, ...)` (imported from `roomBroadcast.ts`). `startGraceTimer`'s `setTimeout` callback keeps its `.unref?.()` call (see this plan's Review Focus) and keeps catching/logging `expireSeat`'s rejection exactly as today (`console.error` with the same message format, referencing `ctx.module.id`).

- [ ] **Step 2: Update `roomStore.ts`** — replace `joinRoom`, `reconnectRoom`, `reconnectByAccount`, `leaveSeat`, `handleDisconnect` method bodies with one-line delegations. `startGraceTimer`/`clearGraceTimer`/`expireSeat` were private helpers, not public API — delete them from the class entirely now that `roomMembership.ts` owns them (nothing outside the class ever called them directly).

- [ ] **Step 3: Run the full platform suite**

Run: `npm run test -w @denimcat/platform`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w @denimcat/platform`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/rooms/roomMembership.ts packages/platform/src/rooms/roomStore.ts
git commit -m "refactor: extract RoomStore's seat membership and grace-timer logic into roomMembership.ts"
```

---

### Task 4: `roomIdleSweep.ts`

**Files:**
- Create: `packages/platform/src/rooms/roomIdleSweep.ts`
- Modify: `packages/platform/src/rooms/roomStore.ts`
- Test: `packages/platform/test/roomStore.test.ts` (run only)

**Interfaces:**
- Consumes: `getRoom` from `roomCore.ts` (Task 1); `clearGraceTimer` from `roomMembership.ts` (Task 3).
- Produces: `sweepIdleRooms(ctx): Promise<void>`, `isPermanentlyExemptFromSweep(ctx, room): boolean`, `recapFullyViewed(ctx, room): boolean`, `idleTimeoutFor(ctx, room): number`, `hasEverBeenClaimed(ctx, room): boolean`, `abandonRoom(ctx, code, accountEmail): Promise<ActionResult>`, `isAbandonable(seatOrder, knownAccounts, mySeats): boolean` (no `ctx` needed — the current private method already takes everything as plain parameters, unchanged), `listOpenRoomsForAccount(ctx, email): Promise<OpenGameSummary<TSeat>[]>` — verbatim from roomStore.ts:694-760 (listOpenRoomsForAccount, isAbandonable, abandonRoom) and :871-946 (hasEverBeenClaimed through sweepIdleRooms).

- [ ] **Step 1: Create `roomIdleSweep.ts`** — move all eight functions verbatim, `this.` → `ctx.` conversion. `abandonRoom` calls `this.clearGraceTimer(code, seat)` for every seat — becomes `clearGraceTimer(ctx, code, seat)`, imported from `./roomMembership.js`. `sweepIdleRooms` iterates `this.cache` directly — becomes `ctx.cache`, and its deletion calls become `ctx.cache.delete(code)` / `ctx.repository.delete(code)`.

- [ ] **Step 2: Update `roomStore.ts`** — replace `listOpenRoomsForAccount` and `abandonRoom` method bodies with one-line delegations; delete the now-dead private `isAbandonable`, `hasEverBeenClaimed`, `isPermanentlyExemptFromSweep`, `recapFullyViewed`, `idleTimeoutFor` methods (none were public API). The constructor's `setInterval` call becomes `setInterval(() => sweepIdleRooms(this.ctx).catch(...), ...)`, importing `sweepIdleRooms` from `./roomIdleSweep.js` — keep the exact same `.unref?.()` call and the same `console.error` message format (see Review Focus).

- [ ] **Step 3: Run the full platform suite**

Run: `npm run test -w @denimcat/platform`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w @denimcat/platform`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/rooms/roomIdleSweep.ts packages/platform/src/rooms/roomStore.ts
git commit -m "refactor: extract RoomStore's idle-sweep and abandonment logic into roomIdleSweep.ts"
```

---

### Task 5: `roomChat.ts`, and `RoomStore` final cleanup

**Files:**
- Create: `packages/platform/src/rooms/roomChat.ts`
- Modify: `packages/platform/src/rooms/roomStore.ts`
- Test: `packages/platform/test/roomStore.test.ts` (run only), `packages/platform/test/roomRepository.test.ts` (run only)

**Interfaces:**
- Consumes: `getRoom`, `persist` from `roomCore.ts` (Task 1); `broadcastRoomInfo` from `roomBroadcast.ts` (Task 2).
- Produces: `sendChatMessage(ctx, code, socketId, text, afterLogIndex, senderName?): Promise<ActionResult>` (+ its `MAX_CHAT_HISTORY` constant) — verbatim from roomStore.ts:772-807.

- [ ] **Step 1: Create `roomChat.ts`** — move `sendChatMessage` and the `MAX_CHAT_HISTORY` constant verbatim, `this.` → `ctx.` conversion.

- [ ] **Step 2: Update `roomStore.ts`** — replace `sendChatMessage`'s method body with a one-line delegation. At this point every public method on `RoomStore` should be either: a one-line delegation to an imported function, the constructor (builds `this.ctx`, starts the sweep timer), or `stop()` (clears the sweep timer and every grace timer — this one stays as real logic, it's instance teardown, not room-domain logic). Confirm by reading the whole file top to bottom that no other private helper methods remain — delete the file's now-unused `RECONNECT_GRACE_MS`/`IDLE_SWEEP_INTERVAL_MS`/`IDLE_ROOM_TIMEOUT_MS`/`IDLE_ROOM_TIMEOUT_AFTER_RECAP_MS` constants only if they're no longer referenced anywhere in `roomStore.ts` itself (they're still used to resolve constructor option defaults, so they likely stay).

- [ ] **Step 3: Confirm the file sizes moved as expected**

Run: `wc -l packages/platform/src/rooms/room*.ts`
Expected: `roomStore.ts` well under 200 lines (constructor + one-liners + `stop()`); the six new files roughly in the 60-180 line range each; total line count across all seven files close to the original 947 (plus the small amount of new context-type boilerplate and the one new test from Task 1 — not a 1:1 match, but no large unexplained growth).

- [ ] **Step 4: Run the full platform suite**

Run: `npm run test -w @denimcat/platform`
Expected: PASS, every file.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck -w @denimcat/platform`
Expected: PASS.

- [ ] **Step 6: Run the full repo test suite and every workspace's typecheck**

Run: `npm test` (from repo root)
Expected: PASS, all workspaces — `RoomStore` is constructed by every game's server wiring in `packages/server/src/index.ts`, so this confirms nothing downstream broke even though `packages/server`'s own tests don't test `RoomStore` directly.

- [ ] **Step 7: Commit**

```bash
git add packages/platform/src/rooms/roomChat.ts packages/platform/src/rooms/roomStore.ts
git commit -m "refactor: extract RoomStore's chat handling into roomChat.ts; RoomStore is now a thin facade"
```
