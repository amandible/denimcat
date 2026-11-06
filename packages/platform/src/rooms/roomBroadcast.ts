import type { RoomInfo } from '@denimcat/shared';
import type { LiveRoom, RoomStoreContext } from './roomStoreContext';

/** Resolves the view a particular viewer should see for a room's current state — passthrough when the game has no hidden information (GameModule.toView unset). */
export function viewFor<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  room: LiveRoom<TState, TSeat>,
  viewer: TSeat | 'spectator',
): unknown {
  return ctx.module.toView ? ctx.module.toView(room.gameState, viewer) : room.gameState;
}

/**
 * Pushes the current (post-mutation or just-resynced) state to every
 * connected seat and spectator, each getting their own per-viewer view via
 * viewFor, then runs GameModule.afterMutation for any extra targeted
 * pushes a specific game needs (e.g. Hyper Bloom's legal_moves hint).
 */
export function broadcastState<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  room: LiveRoom<TState, TSeat>,
  data?: unknown,
): void {
  if (!ctx.module.toView) {
    ctx.nsp.to(room.code).emit('game_state', room.gameState);
  } else {
    for (const seat of room.seatOrder) {
      const s = room.seats[seat];
      if (s?.socketId) ctx.nsp.to(s.socketId).emit('game_state', ctx.module.toView(room.gameState, seat));
    }
    for (const specId of room.spectatorSocketIds) {
      ctx.nsp.to(specId).emit('game_state', ctx.module.toView(room.gameState, 'spectator'));
    }
  }

  ctx.module.afterMutation?.({
    state: room.gameState,
    seatOrder: room.seatOrder,
    data,
    emitToSeat: (seat, event, payload) => {
      const s = room.seats[seat];
      if (s?.socketId) ctx.nsp.to(s.socketId).emit(event as any, payload as any);
    },
    broadcastToRoom: (event, payload) => {
      ctx.nsp.to(room.code).emit(event as any, payload as any);
    },
  });
}

/**
 * A seat belongs in here once it's EVER been claimed (knownAccounts), not
 * just while its live connection record exists — otherwise a seat whose
 * owner stepped away for a couple of minutes looks, to the lobby and to
 * every other viewer, exactly like one nobody has ever joined. `claimed`
 * carries that durable fact; `connected` is still the separate, ordinary
 * live/away signal. `name` prefers the live record (freshest) but falls
 * back to knownNames so it doesn't blink out the moment someone
 * disconnects. A seat with neither a live record nor a known account is
 * genuinely open — no entry at all, same as before.
 */
export function buildRoomInfo<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  room: LiveRoom<TState, TSeat>,
): RoomInfo<TSeat> {
  const seats: Partial<Record<TSeat, { claimed: boolean; connected: boolean; name?: string }>> = {};
  for (const seat of room.seatOrder) {
    const live = room.seats[seat];
    const claimed = !!room.knownAccounts[seat];
    if (!live && !claimed) continue;
    seats[seat] = { claimed, connected: live?.socketId != null, name: live?.name ?? room.knownNames[seat] };
  }
  return {
    code: room.code,
    seatOrder: [...room.seatOrder],
    seats,
    spectatorCount: room.spectatorSocketIds.size,
    chatMessages: room.chatMessages,
    rulesetVersion: room.rulesetVersion,
    rulesetNotice: ctx.module.describeRulesetVersion?.(room.rulesetVersion) ?? undefined,
  };
}

export function broadcastRoomInfo<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  room: LiveRoom<TState, TSeat>,
): void {
  ctx.nsp.to(room.code).emit('room_update', buildRoomInfo(ctx, room));
}
