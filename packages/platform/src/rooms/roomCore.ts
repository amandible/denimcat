import { nanoid } from 'nanoid';
import type { ActionResult, EngineResult, RoomInfo } from '@denimcat/shared';
import { generateRoomCode } from './roomCode';
import type { PersistedRoom } from './roomRepository';
import type { LiveRoom, LiveSeat, RoomStoreContext } from './roomStoreContext';
import { notifyGameEnd, notifyTurn } from './roomNotifications';
import { broadcastRoomInfo, broadcastState, buildRoomInfo } from './roomBroadcast';

export async function createRoom<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  rawConfig: unknown,
): Promise<{ ok: true; roomCode: string } | { ok: false; error: { code: string; message: string } }> {
  const config = ctx.module.parseConfig(rawConfig);
  if (config === null) {
    return { ok: false, error: { code: 'INVALID_CONFIG', message: 'Invalid room configuration.' } };
  }

  let code = generateRoomCode();
  while (ctx.cache.has(code) || (await ctx.repository.get(code))) {
    code = generateRoomCode();
  }

  const now = Date.now();
  const seatOrder = ctx.module.seatsForConfig(config);
  const room: LiveRoom<TState, TSeat> = {
    code,
    roomId: nanoid(),
    gameState: ctx.module.createInitialState(config),
    seatOrder,
    seats: {},
    knownEmails: {},
    knownAccounts: {},
    knownNames: {},
    chatMessages: [],
    recapViewedBy: {},
    rulesetVersion: ctx.module.currentRulesetVersionId,
    spectatorSocketIds: new Set(),
    createdAt: now,
    lastActivityAt: now,
  };
  ctx.cache.set(code, room);
  await persist(ctx, room);
  return { ok: true, roomCode: code };
}

export async function getRoom<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
): Promise<LiveRoom<TState, TSeat> | null> {
  const cached = ctx.cache.get(code);
  if (cached) return cached;

  const inFlight = ctx.hydrating.get(code);
  if (inFlight) return inFlight;

  const promise = hydrateRoom(ctx, code).finally(() => ctx.hydrating.delete(code));
  ctx.hydrating.set(code, promise);
  return promise;
}

async function hydrateRoom<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
): Promise<LiveRoom<TState, TSeat> | null> {
  const persisted = await ctx.repository.get(code);
  if (!persisted) return null;
  if (persisted.gameId !== ctx.module.id) return null; // belongs to a different game's namespace

  const now = Date.now();
  const seats: Partial<Record<TSeat, LiveSeat>> = {};
  // Backfilled from any still-present per-seat email, not just
  // persisted.knownEmails directly — a room saved before this field
  // existed still has its emails sitting on `seats[...].email`.
  const knownEmails: Partial<Record<TSeat, string>> = { ...persisted.knownEmails };
  const knownAccounts: Partial<Record<TSeat, string>> = { ...persisted.knownAccounts };
  const knownNames: Partial<Record<TSeat, string>> = { ...persisted.knownNames };
  for (const seat of persisted.seatOrder) {
    const persistedSeat = persisted.seats[seat];
    if (!persistedSeat) continue;
    seats[seat] = { seatToken: persistedSeat.seatToken, socketId: null, disconnectedAt: now, email: persistedSeat.email, name: persistedSeat.name };
    if (persistedSeat.email) knownEmails[seat] = persistedSeat.email;
    if (persistedSeat.name) knownNames[seat] = persistedSeat.name;
  }

  const hydrated: LiveRoom<TState, TSeat> = {
    code: persisted.code,
    // A room persisted before this field existed never had the chance to
    // collect a survey_responses row keyed by it yet, so minting a fresh
    // one on first load is harmless — see PersistedRoom.roomId's doc comment.
    roomId: persisted.roomId ?? nanoid(),
    gameState: persisted.gameState,
    seatOrder: persisted.seatOrder,
    seats,
    knownEmails,
    knownAccounts,
    knownNames,
    chatMessages: persisted.chatMessages ?? [],
    recapViewedBy: { ...persisted.recapViewedBy },
    rulesetVersion: persisted.rulesetVersion,
    spectatorSocketIds: new Set(),
    createdAt: persisted.createdAt,
    lastActivityAt: persisted.lastActivityAt,
  };
  ctx.cache.set(code, hydrated);
  for (const seat of Object.keys(seats) as TSeat[]) {
    startGraceTimer(ctx, hydrated.code, seat);
  }
  return hydrated;
}

export async function persist<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  room: LiveRoom<TState, TSeat>,
): Promise<void> {
  const seats = {} as Partial<Record<TSeat, { seatToken: string; email?: string; name?: string }>>;
  for (const seat of room.seatOrder) {
    const s = room.seats[seat];
    if (s) seats[seat] = { seatToken: s.seatToken, email: s.email, name: s.name };
  }
  const persisted: PersistedRoom<TState, TSeat> = {
    code: room.code,
    roomId: room.roomId,
    gameId: ctx.module.id,
    gameState: room.gameState,
    seatOrder: [...room.seatOrder],
    seats,
    knownEmails: { ...room.knownEmails },
    knownAccounts: { ...room.knownAccounts },
    knownNames: { ...room.knownNames },
    chatMessages: [...room.chatMessages],
    recapViewedBy: { ...room.recapViewedBy },
    rulesetVersion: room.rulesetVersion,
    createdAt: room.createdAt,
    lastActivityAt: room.lastActivityAt,
  };
  await ctx.repository.save(persisted);
}

/**
 * Runs a game-engine mutation for whichever seat `socketId` is bound to.
 * The acting seat always comes from the socket→seat binding, never from
 * client-supplied data, so a player can never act as a different seat.
 */
export async function applyAction<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
  socketId: string,
  action: (state: TState, seat: TSeat) => EngineResult<TState, any>,
): Promise<ActionResult> {
  const room = await getRoom(ctx, code);
  if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };

  const binding = ctx.socketBindings.get(socketId);
  if (!binding || binding.code !== code || binding.role === 'spectator') {
    return { ok: false, error: { code: 'NOT_A_PLAYER', message: 'Only a seated player may act.' } };
  }

  const previousState = room.gameState;
  let result: EngineResult<TState, any>;
  try {
    result = action(room.gameState, binding.role as TSeat);
  } catch (error) {
    // Defense in depth against a malformed-but-validation-passing payload
    // or an unforeseen engine bug — never let a thrown error from
    // untrusted client input crash the whole socket server.
    console.error(`[room ${code}] action threw unexpectedly:`, error);
    return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } };
  }
  if (!result.ok) return { ok: false, error: result.error };

  room.gameState = result.state;
  room.lastActivityAt = Date.now();
  broadcastState(ctx, room, result.data);
  notifyTurn(ctx, room, previousState);
  // notifyGameEnd mutates room.recapViewedBy directly — persist must run
  // after it (and after notifyTurn, which mutates nothing but is fine
  // either way), so that mutation is actually saved rather than living
  // only in memory until some later action re-persists the room, which
  // may never happen for a room that just finished.
  notifyGameEnd(ctx, room, previousState);
  await persist(ctx, room);
  return { ok: true };
}

/** Seeds a socket's own initial view right after it joins the io room (the broadcast above fires before that). */
export async function getRoomInfo<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
): Promise<RoomInfo<TSeat> | null> {
  const room = await getRoom(ctx, code);
  return room ? buildRoomInfo(ctx, room) : null;
}

/**
 * Re-runs afterMutation (and resends game_state) against the CURRENT
 * state, independent of any actual mutation — called by roomHandlers.ts
 * right after a join/reconnect socket has joined its Socket.IO room, so a
 * game whose afterMutation pushes a targeted per-viewer hint derived from
 * current state (e.g. Hyper Bloom's legal_moves, computed from whoever
 * `getActiveSeat` says is active) gets it resynced on arrival too — not
 * just after the next mutation. Without this, a player reconnecting
 * mid-turn would see a stale/empty hint (no legal moves highlighted)
 * until *something* happened to trigger a fresh mutation, which is
 * exactly the "can't move until I click undo" bug this fixes: clicking
 * undo was the first mutation to come along and finally repopulate it.
 * Must run only after the caller's socket has already called
 * `socket.join(roomCode)` — broadcastState's non-toView branch targets
 * the whole Socket.IO room, which would otherwise miss a socket that
 * hasn't joined it yet.
 */
export async function resyncAfterJoin<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
): Promise<void> {
  const room = await getRoom(ctx, code);
  if (room) broadcastState(ctx, room);
}

export function startGraceTimer<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
  role: TSeat,
): void {
  clearGraceTimer(ctx, code, role);
  const timer = setTimeout(
    () => expireSeat(ctx, code, role).catch((error) => console.error(`[roomStore:${ctx.module.id}] expireSeat failed for ${code}:${role}:`, error)),
    ctx.graceMs,
  );
  timer.unref?.();
  ctx.graceTimers.set(`${code}:${role}`, timer);
}

export function clearGraceTimer<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
  role: TSeat,
): void {
  const key = `${code}:${role}`;
  const timer = ctx.graceTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    ctx.graceTimers.delete(key);
  }
}

async function expireSeat<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
  role: TSeat,
): Promise<void> {
  ctx.graceTimers.delete(`${code}:${role}`);
  const room = ctx.cache.get(code);
  if (!room) return;
  const seat = room.seats[role];
  if (!seat || seat.disconnectedAt === null) return; // reconnected in the meantime
  delete room.seats[role];
  await persist(ctx, room);
  ctx.nsp.to(code).emit('seat_freed', { role });
  broadcastRoomInfo(ctx, room);
}
