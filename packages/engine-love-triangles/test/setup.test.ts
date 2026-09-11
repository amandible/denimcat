import { describe, expect, it } from 'vitest';
import { dealGame } from '../src/setup';
import { LINKS } from '../src/maps/map1';

function fakeRng(): () => number {
  let i = 0;
  const seq = [0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.4, 0.6, 0.8];
  return () => seq[i++ % seq.length];
}

describe('dealGame', () => {
  it('sizes seats and starting gems by player count, later seats starting with more gems', () => {
    const state = dealGame(4, fakeRng());
    expect(state.seats).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(state.players.p1.gems).toBe(9);
    expect(state.players.p2.gems).toBe(10);
    expect(state.players.p3.gems).toBe(11);
    expect(state.players.p4.gems).toBe(12);
  });

  it('deals a 2x3 display and puts the rest of the 45 links in the deck, with no duplicates', () => {
    const state = dealGame(2, fakeRng());
    expect(state.topRow).toHaveLength(3);
    expect(state.bottomRow).toHaveLength(3);
    expect(state.deck).toHaveLength(45 - 6);

    const all = [...state.topRow, ...state.bottomRow, ...state.deck];
    expect(new Set(all).size).toBe(45);
    expect(new Set(all)).toEqual(new Set(Object.keys(LINKS)));
  });

  it('starts nobody owning any links, and player 1 opens', () => {
    const state = dealGame(3, fakeRng());
    for (const seat of state.seats) expect(state.players[seat].ownedLinks).toEqual([]);
    expect(state.activeSeat).toBe('p1');
    expect(state.turnOrder).toEqual(state.seats);
    expect(state.phase).toBe('playing');
  });
});
