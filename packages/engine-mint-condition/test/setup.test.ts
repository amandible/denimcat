import { describe, expect, it } from 'vitest';
import { buildPrizePool, dealGame, priceSlotValues } from '../src/setup';

describe('priceSlotValues', () => {
  it('returns the fixed 2-player slots', () => {
    expect(priceSlotValues(2)).toEqual([0, 5, 10, 15, 20, 25]);
  });

  it('returns the fixed 3-player slots', () => {
    expect(priceSlotValues(3)).toEqual([5, 10, 15, 20, 25, 30]);
  });

  it('returns the fixed 4-player slots', () => {
    expect(priceSlotValues(4)).toEqual([10, 15, 20, 25, 30, 35]);
  });
});

describe('buildPrizePool', () => {
  it('returns 12 prizes for a 2-player game', () => {
    expect(buildPrizePool(2)).toHaveLength(12);
  });

  it('returns 18 prizes for a 3-player game', () => {
    const pool = buildPrizePool(3);
    expect(pool).toHaveLength(18);
    expect(pool.filter((p) => p.color === 'green')).toHaveLength(4);
    expect(pool.filter((p) => p.color === 'purple')).toHaveLength(2);
  });

  it('returns 24 prizes for a 4-player game', () => {
    const pool = buildPrizePool(4);
    expect(pool).toHaveLength(24);
    expect(pool.filter((p) => p.color === 'purple')).toHaveLength(4);
    expect(pool.filter((p) => p.color === 'orange')).toHaveLength(4);
  });

  it('assigns every prize a unique id', () => {
    const pool = buildPrizePool(4);
    expect(new Set(pool.map((p) => p.id)).size).toBe(pool.length);
  });

  it('gives every prize a non-empty flavor name', () => {
    for (const p of buildPrizePool(4)) {
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
    }
  });
});

describe('dealGame', () => {
  it('seats the correct number of players for the given count', () => {
    expect(dealGame(2).seats).toEqual(['p1', 'p2']);
    expect(dealGame(3).seats).toEqual(['p1', 'p2', 'p3']);
    expect(dealGame(4).seats).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('fills only the 2nd/3rd/4th slots (index 1/2/3) at setup, leaving the rest empty', () => {
    const state = dealGame(2, () => 0.37);
    expect(state.priceSlots).toHaveLength(6);
    expect(state.priceSlots[0].prizes).toHaveLength(0);
    expect(state.priceSlots[1].prizes).toHaveLength(1);
    expect(state.priceSlots[2].prizes).toHaveLength(1);
    expect(state.priceSlots[3].prizes).toHaveLength(1);
    expect(state.priceSlots[4].prizes).toHaveLength(0);
    expect(state.priceSlots[5].prizes).toHaveLength(0);
  });

  it('stores the fixed price slots for the player count, ascending by price', () => {
    expect(dealGame(3, () => 0.61).priceSlots.map((s) => s.price)).toEqual([5, 10, 15, 20, 25, 30]);
    expect(dealGame(4, () => 0.61).priceSlots.map((s) => s.price)).toEqual([10, 15, 20, 25, 30, 35]);
  });

  it('deals each player a 2-card hand from their own shuffled four-10s/four-5s/four-1s deck', () => {
    const state = dealGame(2, () => 0.15);
    for (const seat of state.seats) {
      const player = state.players[seat];
      expect(player.hand).toHaveLength(2);
      expect(player.deck).toHaveLength(10);
      expect(player.discard).toEqual([]);
      const allCards = [...player.hand, ...player.deck].sort((a, b) => a - b);
      expect(allCards).toEqual([1, 1, 1, 1, 5, 5, 5, 5, 10, 10, 10, 10]);
    }
  });

  it('always starts the first auction with p1 (never random)', () => {
    const state = dealGame(4, () => 0.9);
    expect(state.auction.openerSeat).toBe('p1');
    expect(state.auction.activeSeat).toBe('p1');
    expect(state.phase).toBe('auction-active');
  });

  it('logs a game-start entry', () => {
    const state = dealGame(3, () => 0.5);
    expect(state.log).toEqual(['Game started with 3 players: p1, p2, p3.']);
  });
});
