import { describe, expect, it } from 'vitest';
import { getLegalBidOptions, pass, placeBid } from '../src/bidding';
import { makeState } from './helpers';

describe('getLegalBidOptions', () => {
  it('enumerates every non-empty subset of the hand as a separate option', () => {
    const state = makeState({ players: { p1: { hand: [2, 3] } } });
    const options = getLegalBidOptions(state, 'p1');
    // 2^2 - 1 = 3 non-empty subsets: [2], [3], [2,3]
    expect(options).toHaveLength(3);
    expect(options).toContainEqual({ amount: 2, cards: [2] });
    expect(options).toContainEqual({ amount: 3, cards: [3] });
    expect(options).toContainEqual({ amount: 5, cards: [2, 3] });
  });

  it('treats two different combinations that sum to the same amount as two distinct options', () => {
    const state = makeState({ players: { p1: { hand: [2, 3, 5] } } });
    const options = getLegalBidOptions(state, 'p1');
    // [5] and [2,3] both sum to 5 -- both must appear separately.
    expect(options).toContainEqual({ amount: 5, cards: [5] });
    expect(options).toContainEqual({ amount: 5, cards: [2, 3] });
  });

  it('filters out any combination that does not exceed the current highest bid', () => {
    const state = makeState({
      players: { p1: { hand: [1, 2, 3] } },
      auction: { highestBid: { seat: 'p2', cardValues: [4], amount: 4 } },
    });
    const options = getLegalBidOptions(state, 'p1');
    for (const opt of options) expect(opt.amount).toBeGreaterThan(4);
    // [2,3]=5 and [1,2,3]=6 both exceed 4; [1]=1 and [2]=2 and [3]=3 and [1,2]=3 and [1,3]=4 do not.
    expect(options).toEqual(
      expect.arrayContaining([
        { amount: 5, cards: [2, 3] },
        { amount: 6, cards: [1, 2, 3] },
      ]),
    );
    expect(options).toHaveLength(2);
  });

  it('returns no options for an empty hand', () => {
    const state = makeState({ players: { p1: { hand: [] } } });
    expect(getLegalBidOptions(state, 'p1')).toEqual([]);
  });
});

describe('placeBid', () => {
  it('accepts a valid opening bid and advances to the next seat', () => {
    const state = makeState({ players: { p1: { hand: [5] }, p2: { hand: [3] } } });
    const result = placeBid(state, 'p1', [5]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.auction.highestBid).toEqual({ seat: 'p1', cardValues: [5], amount: 5 });
    expect(result.state.auction.activeSeat).toBe('p2');
  });

  it('rejects a card not in the bidder\'s hand', () => {
    const state = makeState({ players: { p1: { hand: [5] } } });
    const result = placeBid(state, 'p1', [9]);
    expect(result.ok).toBe(false);
  });

  it('rejects a bid repeating the same card twice', () => {
    const state = makeState({ players: { p1: { hand: [5, 6] } } });
    const result = placeBid(state, 'p1', [5, 5]);
    expect(result.ok).toBe(false);
  });

  it('rejects a bid that does not exceed the current highest bid', () => {
    const state = makeState({
      players: { p1: { hand: [3] } },
      auction: { activeSeat: 'p1', highestBid: { seat: 'p2', cardValues: [4], amount: 4 } },
    });
    const result = placeBid(state, 'p1', [3]);
    expect(result.ok).toBe(false);
  });

  it('rejects a bid from a seat whose turn it is not', () => {
    const state = makeState({ players: { p1: { hand: [5] }, p2: { hand: [3] } }, auction: { activeSeat: 'p2' } });
    const result = placeBid(state, 'p1', [5]);
    expect(result.ok).toBe(false);
  });

  it('a 2-seat auction resolves as soon as the second seat passes', () => {
    const state = makeState({ players: { p1: { hand: [5] }, p2: { hand: [3] } } });
    const bid = placeBid(state, 'p1', [5]);
    expect(bid.ok).toBe(true);
    if (!bid.ok) return;
    const passed = pass(bid.state, 'p2');
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.state.phase).toBe('awaiting-prize-choice');
    expect(passed.state.auction.winnerSeat).toBe('p1');
  });
});

describe('pass', () => {
  it('marks the seat passed and prevents it from acting again this auction', () => {
    const state = makeState({
      seats: ['p1', 'p2', 'p3'],
      players: { p1: { hand: [5] }, p2: { hand: [3] }, p3: { hand: [7] } },
      auction: { turnOrder: ['p1', 'p2', 'p3'], activeSeat: 'p1' },
    });
    const afterPass = pass(state, 'p1');
    expect(afterPass.ok).toBe(true);
    if (!afterPass.ok) return;
    expect(afterPass.state.auction.passedSeats).toEqual(['p1']);
    expect(afterPass.state.auction.activeSeat).toBe('p2');

    const rebid = placeBid(afterPass.state, 'p1', [5]);
    expect(rebid.ok).toBe(false);
  });

  it('records the first passer, used later for the post-auction draw', () => {
    const state = makeState({
      seats: ['p1', 'p2', 'p3'],
      players: { p1: { hand: [5] }, p2: { hand: [3] }, p3: { hand: [7] } },
      auction: { turnOrder: ['p1', 'p2', 'p3'], activeSeat: 'p1' },
    });
    const step1 = pass(state, 'p1');
    if (!step1.ok) throw new Error('expected ok');
    const step2 = placeBid(step1.state, 'p2', [3]);
    if (!step2.ok) throw new Error('expected ok');
    expect(step2.state.auction.passedSeats[0]).toBe('p1');
  });

  it('skips already-passed seats when advancing turn order', () => {
    const state = makeState({
      seats: ['p1', 'p2', 'p3'],
      players: { p1: { hand: [5] }, p2: { hand: [3] }, p3: { hand: [7] } },
      auction: { turnOrder: ['p1', 'p2', 'p3'], activeSeat: 'p2', passedSeats: ['p1'] },
    });
    const result = pass(state, 'p2');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // p1 already passed, so activeSeat must skip straight to p3.
    expect(result.state.auction.activeSeat).toBe('p3');
  });

  it('resolves with no winner when every seat passes without anyone ever bidding', () => {
    const state = makeState({
      players: { p1: { hand: [5] }, p2: { hand: [3] } },
      priceSlots: [
        { price: 1, prizes: [] },
        { price: 2, prizes: [{ id: 'a', color: 'red', points: 1 }] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
      auction: { openerSeat: 'p1', turnOrder: ['p1', 'p2'], activeSeat: 'p1' },
    });
    const step1 = pass(state, 'p1');
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;
    const step2 = pass(step1.state, 'p2');
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;

    // No winner, no draws, but the display still shifted up one slot.
    expect(step2.state.phase).toBe('auction-active');
    expect(step2.state.players.p1.hand).toEqual([5]);
    expect(step2.state.players.p2.hand).toEqual([3]);
    expect(step2.state.priceSlots[2].prizes).toEqual([{ id: 'a', color: 'red', points: 1 }]);
    expect(step2.state.priceSlots[1].prizes).toEqual([]);
    // Opener rotates to the next seat for the new auction.
    expect(step2.state.auction.openerSeat).toBe('p2');
    expect(step2.state.auction.passedSeats).toEqual([]);
  });
});
