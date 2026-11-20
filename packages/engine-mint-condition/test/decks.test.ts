import { describe, expect, it } from 'vitest';
import { drawCardForSeat, drawCardForSeatWithReshuffle, drawPostAuctionCards, drawPostAuctionCardsV3 } from '../src/decks';
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

describe('drawCardForSeatWithReshuffle', () => {
  it('moves exactly one card from deck to hand, same as drawCardForSeat, when the deck is non-empty', () => {
    const state = makeState({ players: { p1: { deck: [3, 7, 9], hand: [1], discard: [5, 5] } } });
    const next = drawCardForSeatWithReshuffle(state, 'p1');
    expect(next.players.p1.deck).toEqual([3, 7]);
    expect(next.players.p1.hand).toEqual([1, 9]);
    expect(next.players.p1.discard).toEqual([5, 5]);
  });

  it('reshuffles the discard pile into a fresh deck once the deck is exhausted, then draws from it', () => {
    const state = makeState({ players: { p1: { deck: [], hand: [1], discard: [5, 10, 1] } } });
    const next = drawCardForSeatWithReshuffle(state, 'p1', () => 0);
    expect(next.players.p1.discard).toEqual([]);
    expect(next.players.p1.hand).toHaveLength(2);
    expect(next.players.p1.deck).toHaveLength(2);
    expect([...next.players.p1.hand.slice(1), ...next.players.p1.deck].sort((a, b) => a - b)).toEqual([1, 5, 10]);
  });

  it('is a no-op once both deck and discard are exhausted', () => {
    const state = makeState({ players: { p1: { deck: [], hand: [1], discard: [] } } });
    const next = drawCardForSeatWithReshuffle(state, 'p1');
    expect(next.players.p1.hand).toEqual([1]);
  });
});

describe('drawPostAuctionCardsV3', () => {
  it('draws one card for every seat, regardless of who won or passed', () => {
    const state = makeState({
      seats: ['p1', 'p2', 'p3'],
      players: {
        p1: { deck: [5], hand: [] },
        p2: { deck: [6], hand: [] },
        p3: { deck: [7], hand: [] },
      },
    });
    const next = drawPostAuctionCardsV3(state, 'p1', null);
    expect(next.players.p1.hand).toEqual([5]);
    expect(next.players.p2.hand).toEqual([6]);
    expect(next.players.p3.hand).toEqual([7]);
  });

  it('reshuffles a seat\'s discard pile when its deck is exhausted', () => {
    const state = makeState({
      players: {
        p1: { deck: [], hand: [], discard: [10] },
        p2: { deck: [5], hand: [] },
      },
    });
    const next = drawPostAuctionCardsV3(state, 'p2', null, () => 0);
    expect(next.players.p1.hand).toEqual([10]);
    expect(next.players.p1.discard).toEqual([]);
  });
});
