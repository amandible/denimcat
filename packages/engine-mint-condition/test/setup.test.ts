import { describe, expect, it } from 'vitest';
import { buildPrizePool, computePrices, dealGame, pricesFromDrawOrder } from '../src/setup';

describe('pricesFromDrawOrder', () => {
  it('does not draw a 4th card when the 3-card sum is already the highest price', () => {
    // individually: 1,2,3 | price4: 4+5=9 | price5: 6+7=13 | threeCards: 8+9+10=27 (> 13, no top-up)
    const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const prices = pricesFromDrawOrder(order);
    expect(prices).toEqual([1, 2, 3, 9, 13, 27]);
  });

  it('draws a 4th card when the 3-card sum is not yet the highest price', () => {
    // individually: 10,11,12 | price4: 13+9=22 | price5: 8+7=15 | threeCards: 1+2+3=6 (<=22, top-up with 4)
    const order = [10, 11, 12, 13, 9, 8, 7, 1, 2, 3, 4, 5, 6];
    const prices = pricesFromDrawOrder(order);
    expect(prices).toEqual([10, 11, 12, 22, 15, 10]); // 6 + 4th card (4) = 10
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

  it('picks a valid random opener and starts the first auction there', () => {
    const state = dealGame(4, () => 0.9);
    expect(state.seats).toContain(state.auction.openerSeat);
    expect(state.auction.activeSeat).toBe(state.auction.openerSeat);
    expect(state.phase).toBe('auction-active');
  });
});
