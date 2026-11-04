import type { ActionResult } from '@denimcat/shared';
import { clearGraceTimer, getRoom } from './roomCore';
import type { LiveRoom, OpenGameSummary, RoomStoreContext } from './roomStoreContext';

/**
 * Every one of this game's rooms where `email` holds a seat, EXCEPT a
 * finished room this account has already viewed the recap of (see
 * PersistedRoom.recapViewedBy) — feeds the landing page's "your games"
 * list (see GET /my-games). `mySeats` is every seat this account holds,
 * which for a hotseat room (every seat joined from the same
 * authenticated browser) is the full seat list — that's what lets
 * 'your-turn' read as "always true" for hotseat with no special-casing:
 * whenever any seat is active, it's necessarily one of `mySeats`. The
 * "viewed" check is account-level, not per-seat, for the same reason —
 * one visit from a hotseat player clears the whole room at once.
 */
export async function listOpenRoomsForAccount<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  email: string,
): Promise<OpenGameSummary<TSeat>[]> {
  const rooms = await ctx.repository.findByAccountEmail(ctx.module.id, email);
  const out: OpenGameSummary<TSeat>[] = [];
  for (const room of rooms) {
    const isFinished = ctx.module.isRoomFinished?.(room.gameState) ?? false;
    if (isFinished && room.recapViewedBy?.[email]) continue; // seen it — same as the old unconditional skip, now gated on having actually looked
    const mySeats = room.seatOrder.filter((seat) => room.knownAccounts?.[seat] === email);
    const activeSeat = ctx.module.getActiveSeat?.(room.gameState) ?? null;
    const otherPlayerNames = room.seatOrder
      .filter((seat) => !mySeats.includes(seat))
      .map((seat) => room.knownNames?.[seat])
      .filter((name): name is string => !!name);
    const status: OpenGameSummary<TSeat>['status'] = isFinished ? 'recap' : activeSeat !== null && mySeats.includes(activeSeat) ? 'your-turn' : 'waiting';
    out.push({
      gameId: ctx.module.id,
      code: room.code,
      mySeats,
      seatCount: room.seatOrder.length,
      status,
      lastActivityAt: room.lastActivityAt,
      createdAt: room.createdAt,
      abandonable: !isFinished && isAbandonable(room.seatOrder, room.knownAccounts, mySeats),
      otherPlayerNames,
    });
  }
  return out;
}

/** True when no seat outside `mySeats` has ever been joined by a different account — see OpenGameSummary.abandonable and abandonRoom. */
export function isAbandonable<TSeat extends string>(seatOrder: readonly TSeat[], knownAccounts: Partial<Record<TSeat, string>> | undefined, mySeats: TSeat[]): boolean {
  return seatOrder.every((seat) => mySeats.includes(seat) || knownAccounts?.[seat] === undefined);
}

/**
 * Deletes an abandoned room outright — offered client-side only when
 * `listOpenRoomsForAccount` reported it `abandonable`, but re-verified
 * here rather than trusted from the caller, since another account
 * could have joined a seat between when that list was fetched and
 * this call landing. Clears any pending reconnect-grace timers for
 * this room's seats (same cleanup sweepIdleRooms already does) and
 * tells any still-connected socket (e.g. this same account open in
 * another tab) the room is gone, via the existing (currently unused
 * elsewhere) room_closed event, before actually deleting. Named
 * "abandon" rather than "cancel" throughout this feature — a "Cancel"
 * button next to a confirm dialog that itself has a Cancel option is
 * confusing.
 */
export async function abandonRoom<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
  accountEmail: string,
): Promise<ActionResult> {
  const room = await getRoom(ctx, code);
  if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };
  const mySeats = room.seatOrder.filter((seat) => room.knownAccounts[seat] === accountEmail);
  if (mySeats.length === 0) {
    return { ok: false, error: { code: 'NOT_YOUR_ROOM', message: 'You do not hold a seat in this room.' } };
  }
  if (!isAbandonable(room.seatOrder, room.knownAccounts, mySeats)) {
    return { ok: false, error: { code: 'NOT_ABANDONABLE', message: 'Another player has joined this room.' } };
  }
  for (const seat of room.seatOrder) clearGraceTimer(ctx, code, seat);
  ctx.nsp.to(code).emit('room_closed', { reason: 'abandoned' });
  ctx.cache.delete(code);
  await ctx.repository.delete(code);
  return { ok: true };
}

/**
 * True once ANY seat has ever been claimed by a known account or email —
 * the durable record (PersistedRoom.knownAccounts/knownEmails), not the
 * live `seats` map, which only reflects who's *currently* connected and
 * is deliberately short-lived (see expireSeat's 2-minute reconnect
 * grace).
 */
export function hasEverBeenClaimed<TState, TSeat extends string>(room: LiveRoom<TState, TSeat>): boolean {
  return Object.keys(room.knownAccounts).length > 0 || Object.keys(room.knownEmails).length > 0;
}

/**
 * Guards sweepIdleRooms: a claimed-but-unfinished room must never be
 * auto-deleted just because its last connected player's live record
 * lapsed — only explicit abandonment should remove it (see
 * abandonRoom/isAbandonable, which already reads knownAccounts, not
 * `seats`, for the identical reason). Confirmed with the designer after
 * a real-world bug report: rooms were disappearing mid-invite because
 * the creator's own seat record lapsed before anyone else joined.
 * Deliberately NOT permanent once the game has actually finished,
 * though — recapFullyViewed already keeps a finished-but-unviewed room
 * alive, and once every claimant has seen the result there's no reason
 * left to hold onto it forever; ordinary idle cleanup should still
 * eventually reclaim it, the same as any other finished game.
 */
export function isPermanentlyExemptFromSweep<TState, TConfig, TSeat extends string>(ctx: RoomStoreContext<TState, TConfig, TSeat>, room: LiveRoom<TState, TSeat>): boolean {
  const isFinished = ctx.module.isRoomFinished?.(room.gameState) ?? false;
  return !isFinished && hasEverBeenClaimed(room);
}

/**
 * True once every account that ever held a seat here has viewed this
 * room's recap — false (never sweep) for a room that isn't finished at
 * all, since that's not what this check is about. Guards sweepIdleRooms:
 * without it, a finished-but-unviewed room (the exact case the "recap"
 * status exists for) could get deleted by the ordinary idle timeout
 * before the slowest account to look ever gets the chance — directly
 * breaking the "stays on the list until viewed, full stop" promise.
 */
export function recapFullyViewed<TState, TConfig, TSeat extends string>(ctx: RoomStoreContext<TState, TConfig, TSeat>, room: LiveRoom<TState, TSeat>): boolean {
  if (!ctx.module.isRoomFinished?.(room.gameState)) return true;
  const accounts = new Set(Object.values(room.knownAccounts).filter((email): email is string => !!email));
  for (const email of accounts) {
    if (!room.recapViewedBy[email]) return false;
  }
  return true;
}

/**
 * A finished room gets the LONGER post-recap grace (days, not minutes) —
 * by the time it's reachable here at all, isPermanentlyExemptFromSweep
 * has already ruled out every unfinished room, so `isFinished` true means
 * this is specifically a finished-and-fully-viewed room (recapFullyViewed
 * already guards the finished-but-unviewed case in sweepIdleRooms), the
 * exact case IDLE_ROOM_TIMEOUT_AFTER_RECAP_MS exists for. Everything else
 * reaching this point is a room nobody ever claimed at all, which keeps
 * the ordinary short timeout — there's nothing to come back and look at.
 */
export function idleTimeoutFor<TState, TConfig, TSeat extends string>(ctx: RoomStoreContext<TState, TConfig, TSeat>, room: LiveRoom<TState, TSeat>): number {
  const isFinished = ctx.module.isRoomFinished?.(room.gameState) ?? false;
  return isFinished ? ctx.idleTimeoutAfterRecapMs : ctx.idleTimeoutMs;
}

export async function sweepIdleRooms<TState, TConfig, TSeat extends string>(ctx: RoomStoreContext<TState, TConfig, TSeat>): Promise<void> {
  const now = Date.now();
  for (const [code, room] of ctx.cache) {
    // A live, currently-connected seat always implies knownAccounts is
    // already set for it (every join is account-authenticated — see
    // hasEverBeenClaimed), so checking seats here too would be redundant;
    // an active spectator has no durable claim at all, so it still needs
    // its own check.
    const hasActiveSpectator = room.spectatorSocketIds.size > 0;
    if (!hasActiveSpectator && !isPermanentlyExemptFromSweep(ctx, room) && now - room.lastActivityAt > idleTimeoutFor(ctx, room) && recapFullyViewed(ctx, room)) {
      ctx.cache.delete(code);
      await ctx.repository.delete(code);
    }
  }
}
