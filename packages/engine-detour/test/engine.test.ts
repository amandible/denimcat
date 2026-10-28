import { describe, expect, it } from 'vitest';
import { playCard } from '../src/engine';
import { makeState } from './helpers';

describe('playCard', () => {
  it('rejects a play from a seat whose turn it is not', () => {
    const state = makeState({ activeSeat: 'p1', players: { p2: { hand: [5] } } });
    const result = playCard(state, 'p2', 5, '0-0');
    expect(result.ok).toBe(false);
  });

  it('rejects a card not in the acting seat\'s hand', () => {
    const state = makeState({ activeSeat: 'p1', players: { p1: { hand: [3] } } });
    const result = playCard(state, 'p1', 9, '0-0');
    expect(result.ok).toBe(false);
  });

  it('a legal play removes the card from hand, covers the target, draws a replacement, and advances the turn', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      activeSeat: 'p1',
      pawnCell: '1-0',
      players: { p1: { hand: [7], deck: [12], deckId: 'A' }, p2: { hand: [], deck: [] } },
      cells: { '0-0': { value: 3, owner: 'neutral' } },
    });
    const result = playCard(state, 'p1', 7, '0-0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.p1.hand).toEqual([12]); // drew the replacement
    expect(result.state.cells['0-0']).toMatchObject({ value: 7, owner: 'p1' });
    expect(result.state.activeSeat).toBe('p2');
  });

  it(
    'every card in a hand can be played via the wild fallback when nothing on the board is lower ' +
      "than it (Review Focus: a turn must never stall) — not just a single value at the " +
      'isLegalPlacement level, but through playCard itself',
    () => {
      // makeState's default board is the 99 sentinel everywhere (see
      // test/helpers.ts) - with no overrides, nothing is ever lower than
      // 1, 2, or 3, so every one of these is wild on any non-pawn cell.
      for (const value of [1, 2, 3]) {
        const state = makeState({
          activeSeat: 'p1',
          pawnCell: '3-3',
          players: { p1: { hand: [value], deck: [], deckId: 'A' } },
        });
        const result = playCard(state, 'p1', value, '0-0');
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        expect(result.state.cells['0-0']).toMatchObject({ value, owner: 'p1' });
      }
    },
  );

  it('ends the game and declares a winner once every seat\'s hand and deck are empty', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      activeSeat: 'p1',
      pawnCell: '1-0',
      players: {
        p1: { hand: [7], deck: [], score: 0, deckId: 'A' },
        p2: { hand: [], deck: [], score: 0 },
      },
      cells: { '0-0': { value: 3, owner: 'neutral' } },
    });
    const result = playCard(state, 'p1', 7, '0-0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('ended');
    expect(result.state.winner).not.toBeNull();
  });

  it("logs where the card was played, and a chain's points and the pawn's resulting position when it scores", () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      activeSeat: 'p1',
      pawnCell: '1-0',
      players: { p1: { hand: [7], deck: [], deckId: 'A' }, p2: { hand: [5], deck: [] } },
      cells: { '0-0': { value: 3, owner: 'neutral' } }, // deck A, value 7 -> right -> no chain (lands off p1's own color; the landing cell is the 99-sentinel neutral default)
    });
    const result = playCard(state, 'p1', 7, '0-0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.log).toContainEqual(expect.stringContaining('p1 played 7 on 0-0'));
  });

  it("logs a scoring chain's point total and the pawn's final position", () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      activeSeat: 'p1',
      pawnCell: '2-1',
      players: { p1: { hand: [1], deck: [], deckId: 'A' }, p2: { hand: [5], deck: [] } },
      // deck A, value 1 -> up: pawn moves 2-1 -> 1-1 (now owned by p1 since
      // we're about to play card 1 there... no - play happens at 0-0, not
      // 1-1; set '1-1' as already p1's own card so the chain scores once
      // landing on it is purely a movement side effect of playing 1 at 0-0
      // is irrelevant here)
      cells: { '0-0': { value: 3, owner: 'neutral' }, '1-1': { value: 9, owner: 'p1' } },
    });
    const result = playCard(state, 'p1', 1, '0-0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // played 1 at 0-0 (direction up) -> pawn 2-1 -> 1-1 (p1's own, +1
    // point) -> direction for value 9 (deck A, (9-1)%4=0 -> up) -> 1-1 ->
    // 0-1, which is the 99-sentinel default (neutral) -> chain stops there.
    expect(result.state.log).toContainEqual(expect.stringMatching(/p1 scored 1 point.*pawn is now on 0-1/));
  });

  it(
    "does NOT end the game when the acting seat's hand and deck both empty out, as long as another " +
      'seat still holds cards (Review Focus: the game ends only once EVERY seat is empty, not the ' +
      'first to finish) — the turn simply advances instead',
    () => {
      const state = makeState({
        seats: ['p1', 'p2'],
        activeSeat: 'p1',
        pawnCell: '1-0',
        players: {
          p1: { hand: [7], deck: [], deckId: 'A' },
          p2: { hand: [5], deck: [] }, // p2 is NOT empty
        },
        cells: { '0-0': { value: 3, owner: 'neutral' } },
      });
      const result = playCard(state, 'p1', 7, '0-0');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.phase).toBe('playing');
      expect(result.state.winner).toBeNull();
      expect(result.state.activeSeat).toBe('p2');
    },
  );
});
