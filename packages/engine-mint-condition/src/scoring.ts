import type { GameState, PrizeCard, SeatId } from './types';
import { cloneState } from './state';

export interface ScoreBreakdown {
  base: number;
  colorBonus: number;
  total: number;
}

/**
 * Decoupled from `GameState` (like `bidOptionsForHand`) so the client can
 * compute a seat's score directly from its view's public `wonPrizes` list,
 * without needing the full internal state it never has.
 */
export function scoreForPrizes(prizes: PrizeCard[]): ScoreBreakdown {
  const base = prizes.reduce((sum, p) => sum + p.points, 0);
  if (prizes.length === 0) return { base, colorBonus: 0, total: base };
  const counts = new Map<string, number>();
  for (const p of prizes) counts.set(p.color, (counts.get(p.color) ?? 0) + 1);
  const colorBonus = Math.max(...counts.values());
  return { base, colorBonus, total: base + colorBonus };
}

export function computeScore(state: GameState, seat: SeatId): number {
  return scoreForPrizes(state.players[seat].wonPrizes).total;
}

export function computeFinalScores(state: GameState): Record<SeatId, number> {
  const scores = {} as Record<SeatId, number>;
  for (const seat of state.seats) scores[seat] = computeScore(state, seat);
  return scores;
}

export function determineWinners(state: GameState): SeatId[] {
  const scores = computeFinalScores(state);
  const max = Math.max(...state.seats.map((s) => scores[s]));
  return state.seats.filter((s) => scores[s] === max);
}

/** Both the prize deck and every price slot must be empty. */
export function isGameOver(state: GameState): boolean {
  return state.prizeDeck.length === 0 && state.priceSlots.every((slot) => slot.prizes.length === 0);
}

export function applyGameEndIfDone(state: GameState): GameState {
  if (!isGameOver(state)) return state;
  const next = cloneState(state);
  next.phase = 'ended';
  next.winner = determineWinners(next);
  return next;
}
