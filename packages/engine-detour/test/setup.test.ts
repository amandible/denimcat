import { describe, expect, it } from 'vitest';
import { dealGame } from '../src/setup';
import { BOARD_CELLS } from '../src/board';

function seededRng(sequence: number[]): () => number {
  let i = 0;
  return () => sequence[i++ % sequence.length];
}

describe('dealGame', () => {
  it('fills all 18 cells with the neutral cards 1-18, each exactly once', () => {
    const state = dealGame(2, Math.random);
    const values = BOARD_CELLS.map((c) => state.cells[c].value).sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    for (const c of BOARD_CELLS) expect(state.cells[c].owner).toBe('neutral');
  });

  it('starts the pawn on whichever cell holds the neutral 18', () => {
    const state = dealGame(2, Math.random);
    expect(state.cells[state.pawnCell].value).toBe(18);
  });

  it('assigns exactly `playerCount` distinct decks to the seats, and deals 3-card hands from a 20-card personal deck', () => {
    const state = dealGame(3, Math.random);
    expect(state.seats).toEqual(['p1', 'p2', 'p3']);
    const deckIds = state.seats.map((s) => state.players[s].deckId);
    expect(new Set(deckIds).size).toBe(3); // distinct
    for (const seat of state.seats) {
      const p = state.players[seat];
      expect(p.hand).toHaveLength(3);
      expect(p.deck).toHaveLength(17);
      expect([...p.hand, ...p.deck].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    }
  });

  it('is deterministic given a fixed rng (for reproducible tests elsewhere)', () => {
    const a = dealGame(2, seededRng([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]));
    const b = dealGame(2, seededRng([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]));
    expect(a).toEqual(b);
  });

  it('starts in the playing phase with activeSeat p1 and no winner', () => {
    const state = dealGame(2, Math.random);
    expect(state.phase).toBe('playing');
    expect(state.activeSeat).toBe('p1');
    expect(state.winner).toBeNull();
  });

  it('logs the game starting with its seat list — so an async-play player returning later can tell this room apart from an empty log', () => {
    const state = dealGame(3, Math.random);
    expect(state.log).toContainEqual(expect.stringContaining('Game started with 3 players: p1, p2, p3'));
  });
});
