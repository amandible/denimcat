import type { EngineResult, SeatId } from './types';
import type { GameState, LinkId } from './types';
import type { LoveTrianglesEvent } from './events';
import { cloneState, nextSeat } from './state';
import { refillDisplay, sweepUnplayable } from './display';
import { effectiveCost } from './presence';
import { applyGameEndIfDone } from './scoring';
import { ok, err } from './result';

function requireActiveSeat(state: GameState, seat: SeatId): EngineResult | null {
  if (state.phase !== 'playing') return err('GAME_OVER', 'The game has already ended.');
  if (state.activeSeat !== seat) return err('NOT_YOUR_TURN', "It isn't your turn.");
  return null;
}

/** Passing gains two gems and ends the turn; the display is untouched. */
export function pass(state: GameState, seat: SeatId): EngineResult {
  const rejection = requireActiveSeat(state, seat);
  if (rejection) return rejection;

  const next = cloneState(state);
  next.players[seat].gems += 2;
  next.activeSeat = nextSeat(next.turnOrder, seat);
  return ok(next);
}

export function buyLink(state: GameState, seat: SeatId, linkId: LinkId): EngineResult<{ events: LoveTrianglesEvent[] }> {
  const rejection = requireActiveSeat(state, seat);
  if (rejection) return rejection;

  const slotIndex = state.topRow.indexOf(linkId);
  if (slotIndex === -1) {
    return err('NOT_IN_TOP_ROW', 'That link is not currently available to buy.');
  }

  const cost = effectiveCost(state, linkId, seat);
  if (state.players[seat].gems < cost.total) {
    return err('INSUFFICIENT_GEMS', 'Not enough gems to buy that link.');
  }

  let next = cloneState(state);
  next.players[seat].gems -= cost.total;
  for (const [opponent, amount] of Object.entries(cost.paidToOpponents) as [SeatId, number][]) {
    next.players[opponent].gems += amount;
  }
  next.players[seat].ownedLinks = [...next.players[seat].ownedLinks, linkId];
  next.topRow[slotIndex] = null;

  const events: LoveTrianglesEvent[] = [{ kind: 'purchased', seat, linkId, cost, state: next }];

  next = refillDisplay(next);
  events.push({ kind: 'refilled', state: next });

  const swept = sweepUnplayable(next);
  next = swept.state;
  events.push(...swept.events);

  next = applyGameEndIfDone(next);
  if (next.phase !== 'ended') {
    next.activeSeat = nextSeat(next.turnOrder, seat);
  }

  return ok(next, { events });
}
