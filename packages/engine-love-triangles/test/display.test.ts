import { describe, expect, it } from 'vitest';
import { refillDisplay, sweepUnplayable } from '../src/display';
import { makeState } from './helpers';

describe('refillDisplay', () => {
  it('promotes a bottom-row card into an empty top-row slot, then draws a new bottom-row card', () => {
    const state = makeState({
      topRow: [null, 'A-B', 'B-G'],
      bottomRow: ['C-I', 'E-G', 'H-I'],
      deck: ['I-J'],
    });
    const next = refillDisplay(state);
    expect(next.topRow).toEqual(['C-I', 'A-B', 'B-G']);
    expect(next.bottomRow).toEqual(['I-J', 'E-G', 'H-I']);
    expect(next.deck).toEqual([]);
  });

  it('leaves a slot empty rather than drawing when the deck has run out', () => {
    const state = makeState({ topRow: [null, 'A-B', 'B-G'], bottomRow: [null, 'E-G', 'H-I'], deck: [] });
    const next = refillDisplay(state);
    expect(next.topRow).toEqual([null, 'A-B', 'B-G']);
    expect(next.bottomRow).toEqual([null, 'E-G', 'H-I']);
  });
});

describe('sweepUnplayable', () => {
  it('removes a display card that crosses an already-owned line and pays its owner one gem', () => {
    // A-H crosses C-E (hand-verified in geometry.test.ts). A-B, B-G, G-J,
    // H-I, H-J, I-J all cross nothing on this map, so they're safe filler.
    const state = makeState({
      players: { p1: { ownedLinks: ['A-H'], gems: 10 } },
      topRow: ['C-E', 'A-B', 'B-G'],
      bottomRow: ['G-J', 'H-I', 'H-J'],
      deck: ['I-J'],
    });

    const next = sweepUnplayable(state);
    expect(next.topRow).toEqual(['G-J', 'A-B', 'B-G']); // promoted, then refilled from the deck
    expect(next.bottomRow).toEqual(['I-J', 'H-I', 'H-J']);
    expect(next.deck).toEqual([]);
    expect(next.players.p1.gems).toBe(11);
  });

  it('restarts the scan from the top after each removal, cascading through multiple unplayable cards one at a time', () => {
    // Both C-E and F-G cross A-H and D-J. The scan must find and remove
    // C-E (top row, leftmost) first, refill, restart from the top, then
    // find and remove F-G next — not skip straight past it in one pass.
    const state = makeState({
      players: { p1: { ownedLinks: ['A-H', 'D-J'], gems: 10 } },
      topRow: ['C-E', 'F-G', 'B-G'],
      bottomRow: ['G-J', 'H-I', 'H-J'],
      deck: [],
    });

    const next = sweepUnplayable(state);
    expect(next.topRow).toEqual(['G-J', 'H-I', 'B-G']);
    expect(next.bottomRow).toEqual([null, null, 'H-J']);
    expect(next.deck).toEqual([]);
    // One gem per removal (each removal itself dedupes across the two owned
    // lines it crosses — "even a player who owns multiple relevant lines
    // only gets one gem" — but two separate removals still each pay once).
    expect(next.players.p1.gems).toBe(12);
  });

  it('does nothing when nothing in the display is unplayable', () => {
    const state = makeState({
      players: { p1: { ownedLinks: ['A-H'] } },
      topRow: ['A-B', 'B-G', 'G-J'],
      bottomRow: ['H-I', 'H-J', 'I-J'],
    });
    const next = sweepUnplayable(state);
    expect(next).toEqual(state);
  });
});
