import { describe, expect, it } from 'vitest';
import { drawCardForSeat, drawPostAuctionCards } from '../src/decks';
import { makeState } from './helpers';

describe('drawCardForSeat', () => {
  it('moves exactly one card from deck to hand', () => {
    const state = makeState({ players: { p1: { deck: [3, 7, 9], hand: [1] } } });
    const next = drawCardForSeat(state, 'p1');
    expect(next.players.p1.deck).toEqual([3, 7]);
    expect(next.players.p1.hand).toEqual([1, 9]);
  });

  it('is a no-op once the deck is exhausted', () => {
    const state = makeState({ players: { p1: { deck: [], hand: [1] } } });
    const next = drawCardForSeat(state, 'p1');
    expect(next.players.p1.hand).toEqual([1]);
  });
});

describe('drawPostAuctionCards', () => {
  it('draws for exactly the winner and the first passer', () => {
    const state = makeState({
      seats: ['p1', 'p2', 'p3'],
      players: {
        p1: { deck: [5], hand: [] },
        p2: { deck: [6], hand: [] },
        p3: { deck: [7], hand: [] },
      },
    });
    const next = drawPostAuctionCards(state, 'p1', 'p2');
    expect(next.players.p1.hand).toEqual([5]);
    expect(next.players.p2.hand).toEqual([6]);
    expect(next.players.p3.hand).toEqual([]); // did not win, did not pass first
  });

  it('draws only for the winner when there is no first passer', () => {
    const state = makeState({ players: { p1: { deck: [5], hand: [] }, p2: { deck: [6], hand: [] } } });
    const next = drawPostAuctionCards(state, 'p1', null);
    expect(next.players.p1.hand).toEqual([5]);
    expect(next.players.p2.hand).toEqual([]);
  });
});
