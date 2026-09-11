import { describe, expect, it } from 'vitest';
import { buildPrizePool, computePrices, dealGame, drawUntilUnique } from '../src/setup';

describe('drawUntilUnique', () => {
  it('returns the first attempt immediately when it does not collide', () => {
    let calls = 0;
    const undone: number[][] = [];
    const result = drawUntilUnique(
      () => {
        calls++;
        return { value: 7, cards: [3, 4] };
      },
      (cards) => undone.push(cards),
      [1, 2, 3],
    );
    expect(result).toEqual({ value: 7, cards: [3, 4] });
    expect(calls).toBe(1);
    expect(undone).toEqual([]);
  });

  it('undoes each colliding attempt and keeps retrying until a unique value is drawn', () => {
    const attempts = [
      { value: 5, cards: [2, 3] }, // collides
      { value: 5, cards: [1, 4] }, // collides again
      { value: 9, cards: [4, 5] }, // finally unique
    ];
    let call = 0;
    const undone: number[][] = [];
    const result = drawUntilUnique(
      () => attempts[call++],
      (cards) => undone.push(cards),
      [5, 6, 7],
    );
    expect(result).toEqual({ value: 9, cards: [4, 5] });
    expect(call).toBe(3);
    expect(undone).toEqual([[2, 3], [1, 4]]);
  });
});

describe('computePrices', () => {
  it('produces exactly six positive-integer prices', () => {
    const prices = computePrices(() => 0.42);
    expect(prices).toHaveLength(6);
    for (const p of prices) {
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThan(0);
    }
  });

  it('never produces a repeated price, across many real-random trials', () => {
    for (let i = 0; i < 300; i++) {
      const prices = computePrices();
      expect(new Set(prices).size).toBe(6);
    }
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

  it('stores price slots ascending by price', () => {
    const state = dealGame(3, () => 0.61);
    for (let i = 1; i < state.priceSlots.length; i++) {
      expect(state.priceSlots[i].price).toBeGreaterThanOrEqual(state.priceSlots[i - 1].price);
    }
  });

  it("deals each player a 2-card hand from their own shuffled 1-13 deck", () => {
    const state = dealGame(2, () => 0.15);
    for (const seat of state.seats) {
      const player = state.players[seat];
      expect(player.hand).toHaveLength(2);
      expect(player.deck).toHaveLength(11);
      const allCards = [...player.hand, ...player.deck].sort((a, b) => a - b);
      expect(allCards).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    }
  });

  it('always starts the first auction with p1 (never random)', () => {
    const state = dealGame(4, () => 0.9);
    expect(state.auction.openerSeat).toBe('p1');
    expect(state.auction.activeSeat).toBe('p1');
    expect(state.phase).toBe('auction-active');
  });
});
