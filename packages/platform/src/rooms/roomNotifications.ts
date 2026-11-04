import type { LiveRoom, RoomStoreContext } from './roomStoreContext';

/**
 * If this action just handed the turn to a seat we've ever been given an
 * email for (comparing GameModule.getActiveSeat before vs. after),
 * sends a "it's your turn" notification — unconditionally, regardless of
 * whether that seat currently has a live, foregrounded connection.
 * Deliberately not trying to guess whether the tab is actively watched:
 * confirmed with the designer that supplying an email at all is already
 * a strong, deliberate signal (players who sit down for a live game just
 * don't enter one; async players do), so a connected-and-watching seat
 * getting a redundant email once in a while is an acceptable, low-cost
 * tradeoff against the staleness/complexity of trying to track presence
 * (this replaced an earlier "away" tab-visibility heuristic — see git
 * history if that's ever worth resurrecting). Uses knownEmails, NOT
 * seats[...].email — the live seat entry, and its email along with it,
 * is deleted once that seat's reconnect grace lapses, which happens on
 * essentially every turn in real async play; knownEmails is the durable
 * record that survives that. Fire-and-forget: never awaited, so a slow/
 * broken email API can't delay the acting player's own response. No
 * dedup bookkeeping needed — this only ever fires once per hand-off to a
 * new active seat, since the very next time it could fire again is if
 * the turn changes to someone (which can't happen while the current seat
 * is still active).
 */
export function notifyTurn<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  room: LiveRoom<TState, TSeat>,
  previousState: TState,
): void {
  if (!ctx.module.getActiveSeat) return;
  const before = ctx.module.getActiveSeat(previousState);
  const after = ctx.module.getActiveSeat(room.gameState);
  if (!after || after === before) return;

  const email = room.knownEmails[after];
  if (!email) return;

  // A live seat entry (and its token) may already be gone by now — its
  // own 2-minute reconnect grace lapsed before this later turn even came
  // back around, which is the normal case in real async play. The link
  // still works either way: with a token it reconnects straight back in,
  // without one the client just falls back to its own seat-picker lobby,
  // same as any other stale-token reconnect attempt (see useRoomConnection.ts).
  const seatToken = room.seats[after]?.seatToken;
  const path = ctx.module.roomUrlPath?.(room.code);
  const link =
    ctx.appBaseUrl && path
      ? `${ctx.appBaseUrl}${path}${seatToken ? `?seat=${encodeURIComponent(after)}&token=${encodeURIComponent(seatToken)}` : ''}`
      : null;
  const subject = `It's your turn in ${ctx.module.displayName}!`;
  const text = link
    ? `It's your turn in ${ctx.module.displayName} — room ${room.code}.\n\n${link}`
    : `It's your turn in ${ctx.module.displayName} — room ${room.code}.`;
  ctx.emailSender
    .send(email, subject, text)
    .catch((error) => console.error(`[roomStore:${ctx.module.id}] turn notification failed:`, error));
}

/**
 * Fires once, the instant a room transitions from not-finished to
 * finished (comparing GameModule.isRoomFinished before vs. after, same
 * diff-the-transition shape as notifyTurn above). Two things happen:
 *
 * 1. Every seat with a live, connected socket right now is marked as
 *    having viewed the recap — anyone watching the game conclude live
 *    has, by definition, already seen it. Everyone else (the real
 *    async-play case this whole feature exists for) is left for the
 *    join/reconnect backfill in joinRoom/reconnectRoom/reconnectByAccount
 *    to mark on their next arrival instead.
 * 2. Every seat with a knownEmails entry gets a "game over" email, same
 *    fire-and-forget convention as notifyTurn.
 */
export function notifyGameEnd<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  room: LiveRoom<TState, TSeat>,
  previousState: TState,
): void {
  if (!ctx.module.isRoomFinished) return;
  if (ctx.module.isRoomFinished(previousState) || !ctx.module.isRoomFinished(room.gameState)) return;

  for (const seat of room.seatOrder) {
    const liveSeat = room.seats[seat];
    const account = room.knownAccounts[seat];
    if (liveSeat?.socketId && account) room.recapViewedBy[account] = true;
  }

  for (const seat of room.seatOrder) {
    const email = room.knownEmails[seat];
    if (!email) continue;
    const subject = `Game over in ${ctx.module.displayName} — see how it ended`;
    const path = ctx.module.roomUrlPath?.(room.code);
    const seatToken = room.seats[seat]?.seatToken;
    const link =
      ctx.appBaseUrl && path
        ? `${ctx.appBaseUrl}${path}${seatToken ? `?seat=${encodeURIComponent(seat)}&token=${encodeURIComponent(seatToken)}` : ''}`
        : null;
    const text = link
      ? `Game over in ${ctx.module.displayName} — room ${room.code}. See how it ended:\n\n${link}`
      : `Game over in ${ctx.module.displayName} — room ${room.code}.`;
    ctx.emailSender
      .send(email, subject, text)
      .catch((error) => console.error(`[roomStore:${ctx.module.id}] game-end notification failed:`, error));
  }
}
