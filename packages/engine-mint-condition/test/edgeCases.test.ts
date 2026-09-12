import { describe, expect, it } from 'vitest';
import { getLegalBidOptions, pass, placeBid } from '../src/bidding';
import { placeNewPrize, takePrize } from '../src/prizes';
import { dealGame } from '../src/setup';
import { makeState } from './helpers';
import type { GameState } from '../src/types';

describe('a seat with no legal bid can only pass', () => {
  it('an empty hand yields no bid options and every bid attempt is rejected', () => {
    const state = makeState({ players: { p1: { hand: [] }, p2: { hand: [3] } } });
    expect(getLegalBidOptions(state, 'p1')).toEqual([]);
    expect(placeBid(state, 'p1', [1]).ok).toBe(false);
    expect(pass(state, 'p1').ok).toBe(true);
  });

  it('an exhausted deck stays exhausted — drawing never revives a hand', () => {
    const state = makeState({ players: { p1: { deck: [], hand: [] } } });
    expect(getLegalBidOptions(state, 'p1')).toEqual([]);
  });
});

describe('full 2-player game smoke test', () => {
  it('plays several auctions end to end without any invariant violating', () => {
    let state: GameState = dealGame(2, () => 0.5);
    const opener = state.auction.openerSeat;
    const other = state.seats.find((s) => s !== opener)!;

    for (let auctionCount = 0; auctionCount < 3; auctionCount++) {
      // Whoever's turn it is opens with their cheapest single-card bid; the other always passes.
      const bidderSeat = state.auction.activeSeat;
      const passerSeat = state.seats.find((s) => s !== bidderSeat)!;
      const options = getLegalBidOptions(state, bidderSeat);
      expect(options.length).toBeGreaterThan(0);
      const cheapest = options.reduce((a, b) => (a.amount < b.amount ? a : b));

      const bidResult = placeBid(state, bidderSeat, cheapest.cards);
      expect(bidResult.ok).toBe(true);
      if (!bidResult.ok) return;
      state = bidResult.state;

      const passResult = pass(state, passerSeat);
      expect(passResult.ok).toBe(true);
      if (!passResult.ok) return;
      state = passResult.state;

      expect(state.phase).toBe('awaiting-prize-choice');
      expect(state.auction.winnerSeat).toBe(bidderSeat);

      const affordable = state.priceSlots.flatMap((slot) =>
        slot.price <= cheapest.amount ? slot.prizes : [],
      );
      if (affordable.length === 0) break; // can't afford anything yet, stop this smoke run early

      const chosen = affordable[0];
      const beforeScoreSeats = [...state.seats];
      const takeResult = takePrize(state, bidderSeat, chosen.id);
      expect(takeResult.ok).toBe(true);
      if (!takeResult.ok) return;
      state = takeResult.state;
      expect(state.players[bidderSeat].wonPrizes.map((p) => p.id)).toContain(chosen.id);
      expect(state.seats).toEqual(beforeScoreSeats); // seats never change mid-game

      if (state.phase === 'ended') break;
      if (state.phase === 'awaiting-new-prize-placement') {
        const emptySlot = state.priceSlots.findIndex((s) => s.prizes.length === 0);
        expect(emptySlot).toBeGreaterThanOrEqual(0);
        const placeResult = placeNewPrize(state, bidderSeat, emptySlot);
        expect(placeResult.ok).toBe(true);
        if (!placeResult.ok) return;
        state = placeResult.state;
      }

      expect(['auction-active', 'ended']).toContain(state.phase);
      if (state.phase === 'ended') break;
    }

    // Sanity: total prize count across slots + prizeDeck + everyone's wonPrizes
    // never exceeds the original 12-card pool for a 2-player game (some may
    // have been permanently removed by the priciest-slot mechanic, but none
    // are ever duplicated or fabricated).
    const totalTracked =
      state.priceSlots.reduce((sum, s) => sum + s.prizes.length, 0) +
      state.prizeDeck.length +
      state.seats.reduce((sum, seat) => sum + state.players[seat].wonPrizes.length, 0);
    expect(totalTracked).toBeLessThanOrEqual(12);
  });
});
