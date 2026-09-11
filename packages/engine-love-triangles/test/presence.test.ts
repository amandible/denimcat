import { describe, expect, it } from 'vitest';
import { effectiveCost, isPresent } from '../src/presence';
import { LINKS } from '../src/maps/map1';
import { makeState } from './helpers';

describe('isPresent', () => {
  it('is true for a node incident to any owned link', () => {
    const state = makeState({ players: { p1: { ownedLinks: ['B-D'] } } });
    expect(isPresent(state, 'p1', 'B')).toBe(true);
    expect(isPresent(state, 'p1', 'D')).toBe(true);
    expect(isPresent(state, 'p1', 'C')).toBe(false);
  });
});

describe('effectiveCost', () => {
  it("reproduces the designer's worked example: buyer present at both endpoints, one opponent present at one endpoint", () => {
    // B-C's real base cost in the deck is 5. Buyer (p1) is present at B (via
    // B-D) and at C (via C-F). Opponent p2 is present at C (via C-I).
    // Expected: 5 base + 1 (self@B) + 1 (self@C) + 1 (p2@C) = 8 total,
    // 7 to the bank (5 base + 2 self), 1 to p2 — matching the designer's own
    // "4-cost line -> 7 total, 6 bank + 1 to Green" example structurally,
    // scaled to this link's real base cost of 5.
    const state = makeState({
      seats: ['p1', 'p2'],
      players: {
        p1: { ownedLinks: ['B-D', 'C-F'] },
        p2: { ownedLinks: ['C-I'] },
      },
    });

    const cost = effectiveCost(state, 'B-C', 'p1');
    expect(LINKS['B-C'].baseCost).toBe(5);
    expect(cost.total).toBe(8);
    expect(cost.paidToBank).toBe(7);
    expect(cost.paidToOpponents).toEqual({ p2: 1 });
  });

  it('charges the same opponent twice when they are present at both endpoints', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      players: {
        p1: {},
        p2: { ownedLinks: ['B-D', 'C-F'] }, // present at both B and C
      },
    });

    const cost = effectiveCost(state, 'B-C', 'p1');
    expect(cost.paidToBank).toBe(5); // just the base cost, buyer has no presence
    expect(cost.paidToOpponents).toEqual({ p2: 2 });
    expect(cost.total).toBe(7);
  });

  it('is just the base cost when nobody is present at either endpoint', () => {
    const state = makeState();
    const cost = effectiveCost(state, 'B-C', 'p1');
    expect(cost.total).toBe(5);
    expect(cost.paidToBank).toBe(5);
    expect(cost.paidToOpponents).toEqual({});
  });
});
