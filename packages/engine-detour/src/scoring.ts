import { BOARD_CELLS } from './board';
import type { GameState, SeatId } from './types';

export function isGameOver(state: GameState): boolean {
  return state.seats.every((seat) => {
    const p = state.players[seat];
    return p.hand.length === 0 && p.deck.length === 0;
  });
}

export function computeFinalScores(state: GameState): Record<SeatId, number> {
  const scores = {} as Record<SeatId, number>;
  for (const seat of state.seats) {
    scores[seat] = state.players[seat].score;
  }
  for (const cellId of BOARD_CELLS) {
    const owner = state.cells[cellId].owner;
    if (owner !== 'neutral') {
      scores[owner] += 1;
    }
  }
  return scores;
}

export function determineWinners(scores: Record<SeatId, number>): SeatId[] {
  const entries = Object.entries(scores) as [SeatId, number][];
  const max = Math.max(...entries.map(([, score]) => score));
  return entries.filter(([, score]) => score === max).map(([seat]) => seat);
}
