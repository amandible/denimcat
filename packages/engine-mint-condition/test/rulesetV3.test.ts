import { describe, expect, it } from 'vitest';
import { cardsForRewardTierV3, v3Ruleset } from '../src/rulesetV3';
import { makeState, prize } from './helpers';

const DECK = [1, 1, 1, 1, 5, 5, 5, 5, 10, 10, 10, 10];

describe('cardsForRewardTierV3', () => {
  it('gives 1 card below the lowest price', () => {
    expect(cardsForRewardTierV3(null)).toBe(1);
  });

  it('gives 2 cards for either of the bottom two slots', () => {
    expect(cardsForRewardTierV3(0)).toBe(2);
    expect(cardsForRewardTierV3(1)).toBe(2);
  });

  it('gives 3 cards for either of the middle two slots', () => {
    expect(cardsForRewardTierV3(2)).toBe(3);
    expect(cardsForRewardTierV3(3)).toBe(3);
  });

  it('gives 4 cards for either of the top two slots', () => {
    expect(cardsForRewardTierV3(4)).toBe(4);
    expect(cardsForRewardTierV3(5)).toBe(4);
  });
});

describe('v3Ruleset.drawPostAuctionCards', () => {
  it('draws one card for every seat, including the winner, regardless of who passed', () => {
    const state = makeState({
      seats: ['p1', 'p2', 'p3'],
      players: { p1: { deck: [...DECK] }, p2: { deck: [...DECK] }, p3: { deck: [...DECK] } },
      auction: { winnerSeat: 'p1', passedSeats: ['p2', 'p3'] },
    });
    const next = v3Ruleset.drawPostAuctionCards(state, 'p1', 'p2');
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.players.p2.hand.length).toBe(1);
    expect(next.players.p3.hand.length).toBe(1);
  });
});

describe('v3Ruleset.drawCardsOnNoWinner', () => {
  it('draws one card for every seat even when nobody bid', () => {
    const state = makeState({
      players: { p1: { deck: [...DECK] }, p2: { deck: [...DECK] } },
    });
    const next = v3Ruleset.drawCardsOnNoWinner(state);
    expect(next.players.p1.hand.length).toBe(1);
    expect(next.players.p2.hand.length).toBe(1);
  });
});

describe('v3Ruleset.chooseAuctionReward', () => {
  function stateAwaitingReward(bidAmount: number, priceSlots = makeState().priceSlots) {
    return makeState({
      phase: 'awaiting-prize-choice',
      priceSlots,
      players: { p1: { deck: [...DECK] } },
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [], amount: bidAmount } },
    });
  }

  it('gives 1 card below the lowest slot\'s price', () => {
    const state = stateAwaitingReward(0); // price slots start at 1, so 0 is below the lowest
    const result = v3Ruleset.chooseAuctionReward(state, 'p1', { extraShift: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.players.p1.hand.length).toBe(1);
  });

  it('gives 2 cards for the bottom two slots', () => {
    const state = stateAwaitingReward(1);
    const result = v3Ruleset.chooseAuctionReward(state, 'p1', { extraShift: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.players.p1.hand.length).toBe(2);
  });

  it('gives 4 cards for the top two slots', () => {
    const state = stateAwaitingReward(6);
    const result = v3Ruleset.chooseAuctionReward(state, 'p1', { extraShift: false });
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
    const result = v3Ruleset.chooseAuctionReward(state, 'p1', { extraShift: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.players.p1.hand.length).toBe(2);
      expect(result.state.discardPile).toEqual([prize('c', 'yellow', 5)]);
    }
  });

  it('has no "add a prize" option at all — only extraShift is recognized', () => {
    const state = stateAwaitingReward(1, [
      { price: 1, prizes: [] },
      { price: 2, prizes: [] },
      { price: 3, prizes: [] },
      { price: 4, prizes: [] },
      { price: 5, prizes: [] },
      { price: 6, prizes: [] },
    ]);
    const stateWithDeck = { ...state, prizeDeck: [prize('new', 'red', 3)] };
    const result = v3Ruleset.chooseAuctionReward(stateWithDeck, 'p1', { extraShift: false });
    expect(result.ok).toBe(true);
    // No add-prize branch exists in v3, so the lowest slot stays empty (the
    // normal end-of-round reveal still runs separately, but that's a
    // 'awaiting-new-prize-placement' phase transition, not an immediate add).
    if (result.ok) expect(result.state.phase).toBe('awaiting-new-prize-placement');
  });

  it('rejects the old v1 string-shaped reward', () => {
    const state = stateAwaitingReward(1);
    const result = v3Ruleset.chooseAuctionReward(state, 'p1', 'draw_cards');
    expect(result.ok).toBe(false);
  });

  it('rejects the old v2 shape, even though it also has an extraShift key — the addPrize toggle must be gone, not just ignored', () => {
    const state = stateAwaitingReward(1);
    const result = v3Ruleset.chooseAuctionReward(state, 'p1', { extraShift: false, addPrize: false });
    expect(result.ok).toBe(false);
  });
});

describe('v3Ruleset.placeNewPrize', () => {
  it('still always places into the lowest slot, inherited from v2', () => {
    const state = makeState({
      phase: 'awaiting-new-prize-placement',
      revealedPrize: prize('new', 'green', 4),
      auction: { winnerSeat: 'p1' },
    });
    const result = v3Ruleset.placeNewPrize(state, 'p1', 5);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.priceSlots[0].prizes).toEqual([prize('new', 'green', 4)]);
  });
});

describe('v3Ruleset.applyGameEndIfDone', () => {
  it('is the v3 endgame logic, not v1/v2\'s isGameOver', () => {
    const state = makeState({ prizeDeck: [], players: { p1: { hand: [1] }, p2: { hand: [1] } } });
    const next = v3Ruleset.applyGameEndIfDone(state);
    // Both seats tied for richest -> nobody gets the bonus, game just ends.
    expect(next.phase).toBe('ended');
  });
});
