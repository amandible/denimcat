import { nanoid } from 'nanoid';
import type { JoinResult, Role } from '@denimcat/shared';
import { clearGraceTimer, getRoom, persist, startGraceTimer } from './roomCore';
import { broadcastRoomInfo, viewFor } from './roomBroadcast';
import type { RoomStoreContext } from './roomStoreContext';

export async function joinRoom<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
  role: Role<TSeat>,
  socketId: string,
  email?: string,
  name?: string,
  accountEmail?: string,
): Promise<JoinResult<TSeat, unknown>> {
  const room = await getRoom(ctx, code);
  if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };

  if (role === 'spectator') {
    room.spectatorSocketIds.add(socketId);
    ctx.socketBindings.set(socketId, { code, role: 'spectator' });
    broadcastRoomInfo(ctx, room);
    return { ok: true, gameState: viewFor(ctx, room, 'spectator'), you: { role: 'spectator' } };
  }

  if (!room.seatOrder.includes(role)) {
    return { ok: false, error: { code: 'SEAT_NOT_IN_GAME', message: `No such seat for this room.` } };
  }

  const seat = room.seats[role];
  if (seat && seat.disconnectedAt !== null) {
    return {
      ok: false,
      error: {
        code: 'SEAT_RECONNECTING',
        message: `${role} disconnected recently; reconnect with the original seat token instead.`,
      },
    };
  }
  if (seat) {
    return { ok: false, error: { code: 'SEAT_TAKEN', message: `${role} is already taken.` } };
  }
  // The live record can be gone (expired after the ordinary reconnect
  // grace) while the seat is still genuinely owned — knownAccounts is the
  // durable record of who actually claimed it, and that claim survives a
  // lapsed connection. Without this check, a brand-new visitor's plain
  // join_room would indistinguishably look like the seat was never
  // joined, silently taking over the real owner's identity (and whatever
  // moves they'd already made) the moment their tab happened to be
  // closed for a couple of minutes. The real owner isn't locked out by
  // this — accountEmail matching knownAccounts[role] still passes through.
  const existingOwner = room.knownAccounts[role];
  if (existingOwner && existingOwner !== accountEmail) {
    return { ok: false, error: { code: 'SEAT_TAKEN', message: `${role} is already taken.` } };
  }

  const seatToken = nanoid(21);
  room.seats[role] = { seatToken, socketId, disconnectedAt: null, email, name };
  if (email) room.knownEmails[role] = email;
  if (name) room.knownNames[role] = name;
  if (accountEmail) room.knownAccounts[role] = accountEmail;
  // An account arriving into an already-finished room has, by definition,
  // just seen it — see PersistedRoom.recapViewedBy's doc comment. Rare in
  // practice for a fresh join (seats are normally all filled before a
  // game ends), but harmless and correct if it happens.
  if (accountEmail && ctx.module.isRoomFinished?.(room.gameState)) room.recapViewedBy[accountEmail] = true;
  ctx.socketBindings.set(socketId, { code, role });
  room.lastActivityAt = Date.now();
  await persist(ctx, room);
  broadcastRoomInfo(ctx, room);
  return { ok: true, seatToken, gameState: viewFor(ctx, room, role), you: { role } };
}

export async function reconnectRoom<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
  role: TSeat,
  seatToken: string,
  socketId: string,
  accountEmail?: string,
): Promise<JoinResult<TSeat, unknown>> {
  const room = await getRoom(ctx, code);
  if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };

  const seat = room.seats[role];
  if (!seat || seat.seatToken !== seatToken) {
    return { ok: false, error: { code: 'INVALID_TOKEN', message: 'Seat token does not match.' } };
  }

  clearGraceTimer(ctx, code, role);
  seat.socketId = socketId;
  seat.disconnectedAt = null;
  // Backfills knownAccounts for a seat that predates this feature, or was
  // last (re)joined before this browser's account was known — the very
  // next account-based reconnect attempt (any device) then just works.
  // Never overwrites an existing DIFFERENT account: a seat token lives in
  // browser-scoped localStorage, not account-scoped storage, so a second
  // account signed in on the same browser could otherwise present this
  // seat's stored token and silently reassign ownership away from the
  // account that actually holds it.
  if (accountEmail && !room.knownAccounts[role]) room.knownAccounts[role] = accountEmail;
  // See joinRoom's identical comment — this account has just seen the
  // room's current state, which is "finished" here.
  if (accountEmail && ctx.module.isRoomFinished?.(room.gameState)) room.recapViewedBy[accountEmail] = true;
  ctx.socketBindings.set(socketId, { code, role });
  room.lastActivityAt = Date.now();
  await persist(ctx, room);
  ctx.nsp.to(code).emit('seat_taken_over', { role });
  broadcastRoomInfo(ctx, room);
  return { ok: true, gameState: viewFor(ctx, room, role), you: { role } };
}

/**
 * Tried by a browser with no locally-stored seat token for this room
 * (see roomHandlers.ts's reconnect_by_account): finds whichever seat
 * `accountEmail` has ever held (knownAccounts, which — unlike the live
 * `seats` map — survives a lapsed reconnect grace) and reclaims it,
 * either by taking over a still-live seat (identical semantics to
 * reconnectRoom's own unconditional takeover — same precedent, just
 * reached via account identity instead of a possessed token) or, if the
 * seat's live record already expired, rejoining fresh against the same
 * underlying game state (seat state lives in `gameState`, keyed by seat
 * id, untouched by a seat's own live-record expiry). `fallbackName` is
 * only used in that second case, to avoid a seat silently going nameless
 * once its original LiveSeat.name is gone (no lobby screen is shown to
 * ask again — this whole path is silent-by-design).
 */
export async function reconnectByAccount<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
  accountEmail: string,
  socketId: string,
  fallbackName?: string,
): Promise<JoinResult<TSeat, unknown>> {
  const room = await getRoom(ctx, code);
  if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };

  const role = room.seatOrder.find((seat) => room.knownAccounts[seat] === accountEmail);
  if (!role) {
    return { ok: false, error: { code: 'NO_OWNED_SEAT', message: 'No seat in this room is associated with your account.' } };
  }

  // See joinRoom's identical comment — this account has just seen the
  // room's current state, which is "finished" here. Applies to both
  // branches below (live takeover and fresh-rejoin alike).
  if (ctx.module.isRoomFinished?.(room.gameState)) room.recapViewedBy[accountEmail] = true;

  const existing = room.seats[role];
  if (existing) {
    clearGraceTimer(ctx, code, role);
    existing.socketId = socketId;
    existing.disconnectedAt = null;
    ctx.socketBindings.set(socketId, { code, role });
    room.lastActivityAt = Date.now();
    await persist(ctx, room);
    ctx.nsp.to(code).emit('seat_taken_over', { role });
    broadcastRoomInfo(ctx, room);
    return { ok: true, seatToken: existing.seatToken, gameState: viewFor(ctx, room, role), you: { role } };
  }

  const seatToken = nanoid(21);
  const email = room.knownEmails[role]; // carry forward whatever notify preference this seat last had
  room.seats[role] = { seatToken, socketId, disconnectedAt: null, email, name: fallbackName };
  if (fallbackName) room.knownNames[role] = fallbackName;
  ctx.socketBindings.set(socketId, { code, role });
  room.lastActivityAt = Date.now();
  await persist(ctx, room);
  broadcastRoomInfo(ctx, room);
  return { ok: true, seatToken, gameState: viewFor(ctx, room, role), you: { role } };
}

export async function leaveSeat<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
  socketId: string,
): Promise<void> {
  const room = await getRoom(ctx, code);
  const binding = ctx.socketBindings.get(socketId);
  if (!room || !binding || binding.code !== code) return;

  if (binding.role === 'spectator') {
    room.spectatorSocketIds.delete(socketId);
  } else {
    clearGraceTimer(ctx, code, binding.role);
    delete room.seats[binding.role];
    await persist(ctx, room);
    ctx.nsp.to(code).emit('seat_freed', { role: binding.role });
  }
  ctx.socketBindings.delete(socketId);
  broadcastRoomInfo(ctx, room);
}

export async function handleDisconnect<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  socketId: string,
): Promise<void> {
  const binding = ctx.socketBindings.get(socketId);
  if (!binding) return;
  ctx.socketBindings.delete(socketId);

  const room = await getRoom(ctx, binding.code);
  if (!room) return;

  if (binding.role === 'spectator') {
    room.spectatorSocketIds.delete(socketId);
    broadcastRoomInfo(ctx, room);
    return;
  }

  const seat = room.seats[binding.role];
  if (!seat || seat.socketId !== socketId) return; // stale binding, already superseded
  seat.socketId = null;
  seat.disconnectedAt = Date.now();
  broadcastRoomInfo(ctx, room);
  startGraceTimer(ctx, binding.code, binding.role);
}
