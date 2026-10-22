import { describe, expect, it } from 'vitest';
import {
  chooseAuctionReward,
  eligibleTakeSlotIndex,
  placeNewPrize,
  shiftDisplay,
  slotIndexForBid,
  takePrize,
} from '../src/prizes';
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
    // The prize that was already at the priciest slot is permanently removed...
    expect(next.priceSlots[5].prizes).toEqual([]);
    // ...but not vanished — it's visible in the discard pile.
    expect(next.discardPile).toEqual([prize('c', 'yellow', 5)]);
  });

  it('leaves already-empty slots empty', () => {
    const state = makeState();
    const next = shiftDisplay(state);
    for (const slot of next.priceSlots) expect(slot.prizes).toEqual([]);
    expect(next.discardPile).toEqual([]);
  });

  it('accumulates discarded prizes across multiple shifts rather than replacing the pile', () => {
    const state = makeState({
      discardPile: [prize('old', 'blue', 2)],
      priceSlots: [
        { price: 1, prizes: [] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [prize('c', 'yellow', 5)] },
      ],
    });
    const next = shiftDisplay(state);
    expect(next.discardPile).toEqual([prize('old', 'blue', 2), prize('c', 'yellow', 5)]);
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

  it('replaces a prize that ages out of the priciest slot with a freshly drawn one in the now-empty cheapest slot', () => {
    const state = makeState({
      prizeDeck: [prize('fresh', 'purple', 3)],
      priceSlots: [
        { price: 1, prizes: [] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [prize('c', 'yellow', 5)] },
      ],
    });
    const next = shiftDisplay(state);
    expect(next.discardPile).toEqual([prize('c', 'yellow', 5)]); // the aged-out prize is still gone for good
    expect(next.priceSlots[0].prizes).toEqual([prize('fresh', 'purple', 3)]); // its replacement lands at the bottom
    expect(next.prizeDeck).toEqual([]); // drawn from the deck, not conjured
  });

  it('draws one replacement per aged-out prize when the priciest slot holds more than one (stacking)', () => {
    const state = makeState({
      prizeDeck: [prize('fresh-1', 'purple', 3), prize('fresh-2', 'orange', 2)],
      priceSlots: [
        { price: 1, prizes: [] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [prize('c', 'yellow', 5), prize('d', 'red', 1)] },
      ],
    });
    const next = shiftDisplay(state);
    // Drawn from the end of prizeDeck, same convention as everywhere else
    // this engine draws a prize — so 'fresh-2' comes out first.
    expect(next.priceSlots[0].prizes).toEqual([prize('fresh-2', 'orange', 2), prize('fresh-1', 'purple', 3)]);
    expect(next.prizeDeck).toEqual([]);
  });

  it('does not draw a replacement when nothing actually aged out of the priciest slot (it was already empty)', () => {
    const state = makeState({
      prizeDeck: [prize('untouched', 'green', 4)],
      priceSlots: [
        { price: 1, prizes: [prize('a', 'red', 1)] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
    });
    const next = shiftDisplay(state);
    expect(next.priceSlots[0].prizes).toEqual([]); // the bottom slot just stays empty, no draw triggered
    expect(next.prizeDeck).toEqual([prize('untouched', 'green', 4)]); // untouched
  });

  it('fails soft (fewer replacements than aged-out prizes) once the prize deck runs dry', () => {
    const state = makeState({
      prizeDeck: [],
      priceSlots: [
        { price: 1, prizes: [] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [prize('c', 'yellow', 5)] },
      ],
    });
    const next = shiftDisplay(state);
    expect(next.discardPile).toEqual([prize('c', 'yellow', 5)]); // the discard still happens
    expect(next.priceSlots[0].prizes).toEqual([]); // just nothing to replace it with
  });
});

describe('slotIndexForBid', () => {
  const slots = [
    { price: 1, prizes: [] },
    { price: 2, prizes: [prize('cheap', 'red', 1)] },
    { price: 3, prizes: [] },
    { price: 4, prizes: [prize('mid', 'green', 2)] },
    { price: 5, prizes: [prize('pricey', 'blue', 4)] },
    { price: 6, prizes: [] },
  ];

  it('finds the priciest slot at or below the bid by price position alone — occupancy is irrelevant to the lookup itself', () => {
    expect(slotIndexForBid(slots, 4)).toBe(3); // price-4 slot — happens to be occupied
    expect(slotIndexForBid(slots, 3)).toBe(2); // price-3 slot — empty, but it's still what the bid points to
  });

  it("returns null only when the bid doesn't even reach the cheapest slot's price", () => {
    expect(slotIndexForBid(slots, 0)).toBeNull();
  });
});

describe('eligibleTakeSlotIndex', () => {
  const slots = [
    { price: 1, prizes: [] },
    { price: 2, prizes: [prize('cheap', 'red', 1)] },
    { price: 3, prizes: [] },
    { price: 4, prizes: [prize('mid', 'green', 2)] },
    { price: 5, prizes: [prize('pricey', 'blue', 4)] },
    { price: 6, prizes: [] },
  ];

  it('returns the slot a bid points to, when that slot is occupied', () => {
    expect(eligibleTakeSlotIndex(slots, 4)).toBe(3); // price-4 slot, occupied
  });

  it(
    'returns null — NOT a fallback to a cheaper occupied slot — when the slot a bid points to is empty ' +
      '(confirmed with the designer: this is exactly "a bid that points to an empty slot")',
    () => {
      expect(eligibleTakeSlotIndex(slots, 3)).toBeNull(); // price-3 slot is empty; the occupied price-2 slot is irrelevant
    },
  );

  it("returns null when the bid is lower than the lowest slot's price", () => {
    expect(eligibleTakeSlotIndex(slots, 0)).toBeNull();
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
      // Bids exactly the 'cheap' slot's own price (2), not some higher
      // amount — under the current rules a bid points to the priciest slot
      // AT OR BELOW it found by price position alone, so a bid of 4 here
      // would point to the empty price-4 slot, not fall back to 'cheap'.
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [2], amount: 2 } },
    });
  }

  it(
    "a bid pointing to an empty slot gets nothing, even though a cheaper slot is occupied and would " +
      'otherwise be affordable — confirmed with the designer: no fallback to the cheaper slot',
    () => {
      const state = makeState({
        phase: 'awaiting-prize-choice',
        priceSlots: [
          { price: 3, prizes: [prize('cheap', 'red', 1)] },
          { price: 5, prizes: [] }, // a bid of 6 points here — empty
          { price: 8, prizes: [prize('pricey', 'blue', 4)] },
          { price: 10, prizes: [] },
          { price: 12, prizes: [] },
          { price: 14, prizes: [] },
        ],
        auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [6], amount: 6 } },
      });
      expect(takePrize(state, 'p1', 'cheap').ok).toBe(false); // no fallback to the 3-slot
      expect(chooseAuctionReward(state, 'p1', 'draw_cards').ok).toBe(true); // the reward is available instead
    },
  );

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

  it(
    'no choice of slot: rejects a prize sitting in an affordable-but-not-eligible slot, even though its ' +
      "own price is within the bid — only the priciest occupied slot within the bid may be taken from",
    () => {
      const state = makeState({
        phase: 'awaiting-prize-choice',
        priceSlots: [
          { price: 1, prizes: [] },
          { price: 2, prizes: [prize('cheap', 'red', 1)] },
          { price: 3, prizes: [prize('mid', 'green', 2)] }, // the actually-eligible slot (priciest <= bid)
          { price: 4, prizes: [] },
          { price: 5, prizes: [] },
          { price: 6, prizes: [] },
        ],
        auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [3], amount: 3 } },
      });
      const result = takePrize(state, 'p1', 'cheap'); // affordable, but not the eligible slot
      expect(result.ok).toBe(false);
    },
  );

  it("choice of prize: when the eligible slot holds more than one prize, either may be chosen", () => {
    const state = makeState({
      phase: 'awaiting-prize-choice',
      priceSlots: [
        { price: 1, prizes: [] },
        { price: 2, prizes: [prize('first', 'red', 1), prize('second', 'blue', 2)] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
      prizeDeck: [],
      // Bids exactly the two-prize slot's own price (2) so it's the slot
      // the bid points to by position — a higher bid here would instead
      // point to a higher, empty slot (see the "no fallback" test above).
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [2], amount: 2 } },
    });
    const result = takePrize(state, 'p1', 'second');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.p1.wonPrizes).toEqual([prize('second', 'blue', 2)]);
    // The other prize stays in the display — shifted up one slot (2 -> ...)
    // like everything else that went unbought this round, same as the
    // regular shiftDisplay behavior exercised elsewhere in this file.
    expect(result.state.priceSlots[2].prizes).toEqual([prize('first', 'red', 1)]);
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

describe('chooseAuctionReward', () => {
  it('rejects choosing a reward when at least one displayed prize is affordable', () => {
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
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [1], amount: 1 } },
    });
    const result = chooseAuctionReward(state, 'p1', 'draw_cards');
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
    expect(chooseAuctionReward(state, 'p2', 'draw_cards').ok).toBe(false);
  });

  it("'draw_cards' draws two cards from the winner's own deck into their hand", () => {
    const state = makeState({
      phase: 'awaiting-prize-choice',
      players: { p1: { deck: [7, 9], hand: [3] } },
      priceSlots: [
        { price: 5, prizes: [prize('filler', 'red', 1)] },
        { price: 6, prizes: [] },
        { price: 7, prizes: [] },
        { price: 8, prizes: [] },
        { price: 9, prizes: [] },
        { price: 10, prizes: [] },
      ],
      prizeDeck: [prize('deck-1', 'green', 3)],
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [4], amount: 4 } },
    });
    const result = chooseAuctionReward(state, 'p1', 'draw_cards');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Drawn from the end of the deck, same convention as drawCardForSeat everywhere else.
    expect(result.state.players.p1.hand).toEqual([3, 9, 7]);
    expect(result.state.players.p1.deck).toEqual([]);
    expect(result.state.log.at(-1)).toContain('drew two extra cards');
  });

  it("'draw_cards' fails soft (draws fewer or zero) once the winner's own deck is already empty", () => {
    const state = makeState({
      phase: 'awaiting-prize-choice',
      players: { p1: { deck: [], hand: [3] } },
      priceSlots: [
        { price: 5, prizes: [prize('filler', 'red', 1)] },
        { price: 6, prizes: [] },
        { price: 7, prizes: [] },
        { price: 8, prizes: [] },
        { price: 9, prizes: [] },
        { price: 10, prizes: [] },
      ],
      prizeDeck: [],
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [4], amount: 4 } },
    });
    const result = chooseAuctionReward(state, 'p1', 'draw_cards');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.p1.hand).toEqual([3]); // unchanged — nothing to draw
  });

  it(
    "'extra_shift' moves the display two slots total this round — the reward's own shift, plus the " +
      'normal one every auction gets regardless (reuses shiftDisplay verbatim)',
    () => {
      const state = makeState({
        phase: 'awaiting-prize-choice',
        priceSlots: [
          { price: 5, prizes: [] },
          { price: 6, prizes: [prize('tracked', 'red', 1)] },
          { price: 7, prizes: [] },
          { price: 8, prizes: [] },
          { price: 9, prizes: [] },
          { price: 10, prizes: [] },
        ],
        prizeDeck: [],
        auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [4], amount: 4 } },
      });
      const result = chooseAuctionReward(state, 'p1', 'extra_shift');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.priceSlots[3].prizes).toEqual([prize('tracked', 'red', 1)]); // index 1 -> 2 -> 3
      expect(result.state.log.at(-1)).toContain('shifted the display an extra space');
    },
  );

  it(
    "'add_prizes' draws two prizes blind from the deck into the lowest slot, landing there AFTER " +
      '(not swept up by) the normal end-of-round shift',
    () => {
      const state = makeState({
        phase: 'awaiting-prize-choice',
        priceSlots: [
          { price: 5, prizes: [prize('existing', 'red', 1)] }, // moves up to index 1 via the normal shift
          { price: 6, prizes: [] },
          { price: 7, prizes: [] },
          { price: 8, prizes: [] },
          { price: 9, prizes: [] },
          { price: 10, prizes: [] },
        ],
        prizeDeck: [prize('new-1', 'green', 2), prize('new-2', 'purple', 4)],
        auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [4], amount: 4 } },
      });
      const result = chooseAuctionReward(state, 'p1', 'add_prizes');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.priceSlots[1].prizes).toEqual([prize('existing', 'red', 1)]); // the normal shift still ran
      // Drawn from the end of prizeDeck, same convention as elsewhere — 'new-2' comes out first.
      expect(result.state.priceSlots[0].prizes).toEqual([prize('new-2', 'purple', 4), prize('new-1', 'green', 2)]);
      expect(result.state.prizeDeck).toEqual([]);
      expect(result.state.log.at(-1)).toContain('added two prizes to the lowest slot');
    },
  );

  it("'add_prizes' fails soft (adds fewer or zero) once the prize deck itself is already empty", () => {
    const state = makeState({
      phase: 'awaiting-prize-choice',
      priceSlots: [
        { price: 5, prizes: [prize('existing', 'red', 1)] },
        { price: 6, prizes: [] },
        { price: 7, prizes: [] },
        { price: 8, prizes: [] },
        { price: 9, prizes: [] },
        { price: 10, prizes: [] },
      ],
      prizeDeck: [],
      auction: { winnerSeat: 'p1', highestBid: { seat: 'p1', cardValues: [4], amount: 4 } },
    });
    const result = chooseAuctionReward(state, 'p1', 'add_prizes');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.priceSlots[0].prizes).toEqual([]); // nothing left to add
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

  it('allows placing into an already-occupied slot, stacking the new prize alongside the existing one', () => {
    const state = placingState();
    state.priceSlots[2].prizes = [prize('existing', 'red', 1)];
    const result = placeNewPrize(state, 'p1', 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.priceSlots[2].prizes).toEqual([prize('existing', 'red', 1), prize('revealed', 'purple', 4)]);
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

  it('an unlocked upper slot that already holds a prize still accepts a stacked placement', () => {
    const state = { ...placingState(), unlockedUpperSlots: [4] };
    state.priceSlots[4].prizes = [prize('existing', 'green', 2)];
    const result = placeNewPrize(state, 'p1', 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.priceSlots[4].prizes).toEqual([prize('existing', 'green', 2), prize('revealed', 'purple', 4)]);
  });

  it('does not restrict placement into any of the bottom four slots', () => {
    const state = { ...placingState(), unlockedUpperSlots: [] };
    for (let i = 0; i < 4; i++) {
      expect(placeNewPrize(state, 'p1', i).ok).toBe(true);
    }
  });
});
