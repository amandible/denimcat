import { describe, expect, it } from 'vitest';
import { placeNewPrize, shiftDisplay, skipPrizeChoice, takePrize } from '../src/prizes';
import { resolveAuctionWin } from '../src/bidding';
import { makeState, prize } from './helpers';

describe('resolveAuctionWin', () => {
  it('discards exactly the committed cards from the winner\'s hand', () => {
    const state = makeState({
      players: { p1: { hand: [2, 3, 7] } },
      auction: { highestBid: { seat: 'p1', cardValues: [2, 3], amount: 5 } },
    });
    const result = resolveAuctionWin(state);
    expect(result.players.p1.hand).toEqual([7]);
    expect(result.auction.winnerSeat).toBe('p1');
    expect(result.phase).toBe('awaiting-prize-choice');
  });
});

describe('shiftDisplay', () => {
  it('moves every prize up one slot toward the priciest end', () => {
    const state = makeState({
      priceSlots: [
        { price: 1, prizes: [prize('a', 'red', 1)] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [prize('b', 'blue', 2)] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [prize('c', 'yellow', 5)] },
      ],
    });
    const next = shiftDisplay(state);
    expect(next.priceSlots[0].prizes).toEqual([]);
    expect(next.priceSlots[1].prizes).toEqual([prize('a', 'red', 1)]);
    expect(next.priceSlots[3].prizes).toEqual([prize('b', 'blue', 2)]);
    // The prize that was already at the priciest slot is permanently removed.
    expect(next.priceSlots[5].prizes).toEqual([]);
  });

  it('leaves already-empty slots empty', () => {
    const state = makeState();
    const next = shiftDisplay(state);
    for (const slot of next.priceSlots) expect(slot.prizes).toEqual([]);
  });

  it('unlocks the top two slots the first time a prize naturally drifts into each', () => {
    const state = makeState({
      unlockedUpperSlots: [],
      priceSlots: [
        { price: 1, prizes: [] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [prize('a', 'red', 1)] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
    });
    const afterFirstShift = shiftDisplay(state);
    expect(afterFirstShift.unlockedUpperSlots).toEqual([4]);

    const afterSecondShift = shiftDisplay(afterFirstShift);
    expect(afterSecondShift.unlockedUpperSlots.sort()).toEqual([4, 5]);
  });

  it('never re-locks an already-unlocked upper slot, even once it empties out again', () => {
    const state = makeState({ unlockedUpperSlots: [4, 5] });
    const next = shiftDisplay(state);
    expect(next.unlockedUpperSlots.sort()).toEqual([4, 5]);
  });
});

describe('takePrize', () => {
  function winningState() {
    return makeState({
      phase: 'awaiting-prize-choice',
      priceSlots: [
        { price: 1, prizes: [] },
        { price: 2, prizes: [prize('cheap', 'red', 1)] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [prize('pricey', 'blue', 4)] },
        { price: 6, prizes: [] },
      ],
      prizeDeck: [prize('deck-1', 'green', 3)],
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [4], amount: 4 } },
    });
  }

  it("rejects a prize priced above the winning bid", () => {
    const result = takePrize(winningState(), 'p1', 'pricey');
    expect(result.ok).toBe(false);
  });

  it('rejects a prize not currently in the display', () => {
    const result = takePrize(winningState(), 'p1', 'nonexistent');
    expect(result.ok).toBe(false);
  });

  it('rejects a seat other than the winner', () => {
    const result = takePrize(winningState(), 'p2', 'cheap');
    expect(result.ok).toBe(false);
  });

  it('awards the prize, shifts the display, and moves to placing the new reveal', () => {
    const result = takePrize(winningState(), 'p1', 'cheap');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.p1.wonPrizes).toEqual([prize('cheap', 'red', 1)]);
    expect(result.state.priceSlots[2].prizes).toEqual([]); // the taken prize is gone
    expect(result.state.priceSlots[5].prizes).toEqual([prize('pricey', 'blue', 4)]); // shifted up one
    expect(result.state.phase).toBe('awaiting-new-prize-placement');
    // The prize is revealed immediately (before a slot is chosen for it),
    // not popped-and-placed atomically — the winner must be able to see it.
    expect(result.state.revealedPrize).toEqual(prize('deck-1', 'green', 3));
    expect(result.state.prizeDeck).toEqual([]);
  });

  it('skips straight to concluding the auction when the prize deck is already empty', () => {
    const state = winningState();
    state.prizeDeck = [];
    const result = takePrize(state, 'p1', 'cheap');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('auction-active');
    expect(result.state.auction.openerSeat).toBe('p1'); // winner opens the next auction
  });
});

describe('skipPrizeChoice', () => {
  it('rejects skipping when at least one displayed prize is affordable', () => {
    const state = makeState({
      phase: 'awaiting-prize-choice',
      priceSlots: [
        { price: 1, prizes: [prize('cheap', 'red', 1)] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [4], amount: 4 } },
    });
    const result = skipPrizeChoice(state, 'p1');
    expect(result.ok).toBe(false);
  });

  it('rejects a seat other than the winner', () => {
    const state = makeState({
      phase: 'awaiting-prize-choice',
      priceSlots: [
        { price: 5, prizes: [prize('too-pricey', 'red', 1)] },
        { price: 6, prizes: [] },
        { price: 7, prizes: [] },
        { price: 8, prizes: [] },
        { price: 9, prizes: [] },
        { price: 10, prizes: [] },
      ],
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [4], amount: 4 } },
    });
    expect(skipPrizeChoice(state, 'p2').ok).toBe(false);
  });

  it('takes nothing but otherwise proceeds exactly like a normal prize choice when nothing is affordable', () => {
    const state = makeState({
      phase: 'awaiting-prize-choice',
      priceSlots: [
        { price: 5, prizes: [prize('too-pricey', 'red', 1)] },
        { price: 6, prizes: [] },
        { price: 7, prizes: [] },
        { price: 8, prizes: [] },
        { price: 9, prizes: [] },
        { price: 10, prizes: [] },
      ],
      prizeDeck: [prize('deck-1', 'green', 3)],
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [4], amount: 4 } },
    });
    const result = skipPrizeChoice(state, 'p1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.p1.wonPrizes).toEqual([]);
    // The display still shifted even though nothing was taken.
    expect(result.state.priceSlots[0].prizes).toEqual([]);
    expect(result.state.priceSlots[1].prizes).toEqual([prize('too-pricey', 'red', 1)]);
    expect(result.state.phase).toBe('awaiting-new-prize-placement');
  });
});

describe('placeNewPrize', () => {
  function placingState() {
    return makeState({
      phase: 'awaiting-new-prize-placement',
      revealedPrize: prize('revealed', 'purple', 4),
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [4], amount: 4 } },
    });
  }

  it('rejects placing when there is no revealed prize waiting', () => {
    const state = { ...placingState(), revealedPrize: null };
    const result = placeNewPrize(state, 'p1', 0);
    expect(result.ok).toBe(false);
  });

  it('rejects placing into an occupied slot', () => {
    const state = placingState();
    state.priceSlots[2].prizes = [prize('existing', 'red', 1)];
    const result = placeNewPrize(state, 'p1', 2);
    expect(result.ok).toBe(false);
  });

  it('rejects a seat other than the winner', () => {
    const result = placeNewPrize(placingState(), 'p2', 0);
    expect(result.ok).toBe(false);
  });

  it('places the already-revealed prize into the chosen empty slot and concludes the auction', () => {
    const result = placeNewPrize(placingState(), 'p1', 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.priceSlots[0].prizes).toEqual([prize('revealed', 'purple', 4)]);
    expect(result.state.revealedPrize).toBeNull();
    expect(result.state.phase).toBe('auction-active');
    expect(result.state.auction.openerSeat).toBe('p1');
  });

  it('rejects placing into either of the top two slots before a prize has naturally risen into it', () => {
    const state = { ...placingState(), unlockedUpperSlots: [] };
    expect(placeNewPrize(state, 'p1', 4).ok).toBe(false);
    expect(placeNewPrize(state, 'p1', 5).ok).toBe(false);
  });

  it('allows placing into a top slot once it has been naturally unlocked', () => {
    const state = { ...placingState(), unlockedUpperSlots: [4] };
    expect(placeNewPrize(state, 'p1', 4).ok).toBe(true);
    expect(placeNewPrize(state, 'p1', 5).ok).toBe(false);
  });

  it('does not restrict placement into any of the bottom four slots', () => {
    const state = { ...placingState(), unlockedUpperSlots: [] };
    for (let i = 0; i < 4; i++) {
      expect(placeNewPrize(state, 'p1', i).ok).toBe(true);
    }
  });
});
