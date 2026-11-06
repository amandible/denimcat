import { describe, expect, it } from 'vitest';
import { v2Ruleset } from '../src/rulesetV2';
import { makeState, prize } from './helpers';

const DECK = [1, 2, 3, 4, 5, 6, 7, 8];

describe('v2Ruleset.drawPostAuctionCards', () => {
  it('draws for the first two passers, not the winner', () => {
    const state = makeState({
      seats: ['p1', 'p2', 'p3'],
      players: { p1: { deck: [...DECK] }, p2: { deck: [...DECK] }, p3: { deck: [...DECK] } },
      auction: { winnerSeat: 'p1', passedSeats: ['p2', 'p3'] },
    });
    const next = v2Ruleset.drawPostAuctionCards(state, 'p1', 'p2');
    expect(next.players.p1.hand).toEqual([]);
    expect(next.players.p2.hand.length).toBe(1);
    expect(next.players.p3.hand.length).toBe(1);
  });

  it('draws for just one seat when only one passed (2-player game)', () => {
    const state = makeState({
      players: { p1: { deck: [...DECK] }, p2: { deck: [...DECK] } },
      auction: { winnerSeat: 'p1', passedSeats: ['p2'] },
    });
    const next = v2Ruleset.drawPostAuctionCards(state, 'p1', 'p2');
    expect(next.players.p2.hand.length).toBe(1);
  });

  it('draws for nobody when nobody passed', () => {
    const state = makeState({
      players: { p1: { deck: [...DECK] }, p2: { deck: [...DECK] } },
      auction: { winnerSeat: 'p1', passedSeats: [] },
    });
    const next = v2Ruleset.drawPostAuctionCards(state, 'p1', null);
    expect(next.players.p1.hand).toEqual([]);
    expect(next.players.p2.hand).toEqual([]);
  });
});

describe('v2Ruleset.chooseAuctionReward', () => {
  function stateAwaitingReward(bidAmount: number, priceSlots = makeState().priceSlots) {
    return makeState({
      phase: 'awaiting-prize-choice',
      priceSlots,
      players: { p1: { deck: [...DECK] } },
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [], amount: bidAmount } },
    });
  }

  it('always grants the card draw even when neither extra is chosen', () => {
    const state = stateAwaitingReward(1); // bottom tier -> 2 cards
    const result = v2Ruleset.chooseAuctionReward(state, 'p1', { extraShift: false, addPrize: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.players.p1.hand.length).toBe(2);
  });

  it('draws 2 cards for the bottom two slots or below the lowest price', () => {
    const state = stateAwaitingReward(0); // below slot 0's price of 1
    const result = v2Ruleset.chooseAuctionReward(state, 'p1', { extraShift: false, addPrize: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.players.p1.hand.length).toBe(2);
  });

  it('draws 3 cards for the middle two slots', () => {
    const state = stateAwaitingReward(3); // slot index 2, middle tier
    const result = v2Ruleset.chooseAuctionReward(state, 'p1', { extraShift: false, addPrize: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.players.p1.hand.length).toBe(3);
  });

  it('draws 4 cards for the top two slots', () => {
    const state = stateAwaitingReward(6); // slot index 5, top tier
    const result = v2Ruleset.chooseAuctionReward(state, 'p1', { extraShift: false, addPrize: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.players.p1.hand.length).toBe(4);
  });

  it('can also take the extra shift on top of the guaranteed draw', () => {
    const state = stateAwaitingReward(1, [
      { price: 1, prizes: [] },
      { price: 2, prizes: [] },
      { price: 3, prizes: [] },
      { price: 4, prizes: [] },
      { price: 5, prizes: [] },
      { price: 6, prizes: [prize('c', 'yellow', 5)] },
    ]);
    const result = v2Ruleset.chooseAuctionReward(state, 'p1', { extraShift: true, addPrize: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.players.p1.hand.length).toBe(2);
      expect(result.state.discardPile).toEqual([prize('c', 'yellow', 5)]);
    }
  });

  it('can also add a prize on top of the guaranteed draw', () => {
    const state = stateAwaitingReward(1, [
      { price: 1, prizes: [] },
      { price: 2, prizes: [] },
      { price: 3, prizes: [] },
      { price: 4, prizes: [] },
      { price: 5, prizes: [] },
      { price: 6, prizes: [] },
    ]);
    const stateWithDeck = { ...state, prizeDeck: [prize('new', 'red', 3)] };
    const result = v2Ruleset.chooseAuctionReward(stateWithDeck, 'p1', { extraShift: false, addPrize: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.players.p1.hand.length).toBe(2);
      expect(result.state.priceSlots[0].prizes).toEqual([prize('new', 'red', 3)]);
    }
  });

  it('rejects the old v1 string-shaped reward', () => {
    const state = stateAwaitingReward(1);
    const result = v2Ruleset.chooseAuctionReward(state, 'p1', 'draw_cards');
    expect(result.ok).toBe(false);
  });
});

describe('v2Ruleset.placeNewPrize', () => {
  it('always places into the lowest slot regardless of the requested slotIndex', () => {
    const state = makeState({
      phase: 'awaiting-new-prize-placement',
      revealedPrize: prize('new', 'green', 4),
      auction: { winnerSeat: 'p1' },
      priceSlots: [
        { price: 1, prizes: [] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
    });
    const result = v2Ruleset.placeNewPrize(state, 'p1', 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.priceSlots[0].prizes).toEqual([prize('new', 'green', 4)]);
      expect(result.state.priceSlots[5].prizes).toEqual([]);
      expect(result.state.revealedPrize).toBeNull();
    }
  });

  it('never locks on the upper-slot gate, since it never targets an upper slot', () => {
    const state = makeState({
      phase: 'awaiting-new-prize-placement',
      revealedPrize: prize('new', 'green', 4),
      unlockedUpperSlots: [],
      auction: { winnerSeat: 'p1' },
    });
    const result = v2Ruleset.placeNewPrize(state, 'p1', 4);
    expect(result.ok).toBe(true);
  });
});
