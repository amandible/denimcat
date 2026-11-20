import type { GameState, PrizeCard, SeatId } from './types';
import { cloneState, pushLog } from './state';

export interface ScoreBreakdown {
  base: number;
  colorBonus: number;
  total: number;
}

/**
 * The color bonus scales as a triangular number of the most-common-color
 * count (1, 3, 6, 10, ... for 1, 2, 3, 4, ... cards) rather than linearly
 * (1, 2, 3, 4, ...) — a steeper reward for committing to one color, per the
 * designer's latest revision.
 */
function triangularNumber(n: number): number {
  return (n * (n + 1)) / 2;
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
  const mostCommonCount = Math.max(...counts.values());
  const colorBonus = triangularNumber(mostCommonCount);
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

/**
 * Shared tail for every version's game-end handling: stamp the final phase
 * and winner list, and log it. Pulled out so v3's own endgame logic (see
 * endgame.ts) can reuse it without duplicating the phase/log bookkeeping.
 */
export function finalizeGameEnd(state: GameState, winners: SeatId[]): GameState {
  const next = cloneState(state);
  next.phase = 'ended';
  next.winner = winners;
  pushLog(next, winners.length > 1 ? `Shared victory: ${winners.join(', ')}.` : `${winners[0]} wins!`);
  return next;
}

export function applyGameEndIfDone(state: GameState): GameState {
  if (!isGameOver(state)) return state;
  return finalizeGameEnd(state, determineWinners(state));
}

/**
 * v3's color bonus: a singleton now scores 0 instead of v1/v2's 1 — every
 * other step of the triangular progression (3, 6, 10) is unchanged. Kept as
 * a one-line special case rather than a new formula, since it's the only
 * value that actually differs.
 */
export function scoreForPrizesV3(prizes: PrizeCard[]): ScoreBreakdown {
  const base = prizes.reduce((sum, p) => sum + p.points, 0);
  if (prizes.length === 0) return { base, colorBonus: 0, total: base };
  const counts = new Map<string, number>();
  for (const p of prizes) counts.set(p.color, (counts.get(p.color) ?? 0) + 1);
  const mostCommonCount = Math.max(...counts.values());
  const colorBonus = mostCommonCount === 1 ? 0 : triangularNumber(mostCommonCount);
  return { base, colorBonus, total: base + colorBonus };
}

export function computeScoreV3(state: GameState, seat: SeatId): number {
  return scoreForPrizesV3(state.players[seat].wonPrizes).total;
}

export function computeFinalScoresV3(state: GameState): Record<SeatId, number> {
  const scores = {} as Record<SeatId, number>;
  for (const seat of state.seats) scores[seat] = computeScoreV3(state, seat);
  return scores;
}

export function determineWinnersV3(state: GameState): SeatId[] {
  const scores = computeFinalScoresV3(state);
  const max = Math.max(...state.seats.map((s) => scores[s]));
  return state.seats.filter((s) => scores[s] === max);
}
