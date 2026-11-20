import { describe, expect, it } from 'vitest';
import { applyGameEndIfDoneV3, chooseEndgamePrize } from '../src/endgame';
import { makeState, prize } from './helpers';

describe('applyGameEndIfDoneV3', () => {
  it('does nothing while the prize deck still has cards', () => {
    const state = makeState({ prizeDeck: [prize('x', 'red', 1)] });
    const next = applyGameEndIfDoneV3(state);
    expect(next.phase).toBe('auction-active');
  });

  it('ends the game immediately once the prize deck is empty, even with prizes still in the display', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      prizeDeck: [],
      players: { p1: { hand: [10], wonPrizes: [] }, p2: { hand: [1], wonPrizes: [] } },
      priceSlots: [
        { price: 1, prizes: [prize('a', 'red', 2)] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
    });
    const next = applyGameEndIfDoneV3(state);
    expect(next.phase).toBe('ended');
  });

  it('gives the richest-in-hand seat the cheapest displayed prize', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      prizeDeck: [],
      players: { p1: { hand: [10, 10], wonPrizes: [] }, p2: { hand: [1], wonPrizes: [] } },
      priceSlots: [
        { price: 1, prizes: [prize('cheap', 'red', 2)] },
        { price: 2, prizes: [prize('pricey', 'blue', 8)] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
    });
    const next = applyGameEndIfDoneV3(state);
    expect(next.phase).toBe('ended');
    expect(next.players.p1.wonPrizes.map((p) => p.id)).toEqual(['cheap']);
    expect(next.priceSlots.flatMap((s) => s.prizes).map((p) => p.id)).toEqual(['pricey']);
  });

  it('gives nobody the bonus when seats tie for richest-in-hand', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      prizeDeck: [],
      players: { p1: { hand: [5], wonPrizes: [] }, p2: { hand: [5], wonPrizes: [] } },
      priceSlots: [
        { price: 1, prizes: [prize('cheap', 'red', 2)] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
    });
    const next = applyGameEndIfDoneV3(state);
    expect(next.phase).toBe('ended');
    expect(next.players.p1.wonPrizes).toEqual([]);
    expect(next.players.p2.wonPrizes).toEqual([]);
  });

  it('pauses for an explicit choice when multiple displayed prizes tie for cheapest', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      prizeDeck: [],
      players: { p1: { hand: [10], wonPrizes: [] }, p2: { hand: [1], wonPrizes: [] } },
      priceSlots: [
        { price: 1, prizes: [prize('a', 'red', 2), prize('b', 'blue', 2)] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
    });
    const next = applyGameEndIfDoneV3(state);
    expect(next.phase).toBe('awaiting-endgame-prize-choice');
    expect(next.endgameChoice).toEqual({ seat: 'p1', prizeIds: ['a', 'b'] });
  });

  it('uses v3\'s own color-bonus scoring (singleton = 0) to determine the final winner', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      prizeDeck: [],
      players: {
        p1: { hand: [10], wonPrizes: [prize('x', 'red', 5)] }, // singleton -> bonus 0 -> total 5
        p2: { hand: [1], wonPrizes: [prize('y', 'blue', 2), prize('z', 'blue', 1)] }, // pair -> bonus 3 -> total 6
      },
      priceSlots: [
        { price: 1, prizes: [prize('a', 'green', 9)] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
    });
    const next = applyGameEndIfDoneV3(state);
    expect(next.phase).toBe('ended');
    // p1 is richest-in-hand and takes the only (cheapest) displayed prize, scoring 5+9=14 + 0 bonus = 14.
    // p2's own total stays 6. p1 should win.
    expect(next.winner).toEqual(['p1']);
  });
});

describe('chooseEndgamePrize', () => {
  function stateAwaitingChoice() {
    return makeState({
      seats: ['p1', 'p2'],
      phase: 'awaiting-endgame-prize-choice',
      endgameChoice: { seat: 'p1', prizeIds: ['a', 'b'] },
      players: { p1: { wonPrizes: [] }, p2: { wonPrizes: [] } },
      priceSlots: [
        { price: 1, prizes: [prize('a', 'red', 2), prize('b', 'blue', 2)] },
        { price: 2, prizes: [] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
    });
  }

  it('grants the chosen prize and ends the game', () => {
    const result = chooseEndgamePrize(stateAwaitingChoice(), 'p1', 'b');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.p1.wonPrizes.map((p) => p.id)).toEqual(['b']);
    expect(result.state.priceSlots[0].prizes.map((p) => p.id)).toEqual(['a']);
    expect(result.state.phase).toBe('ended');
    expect(result.state.endgameChoice).toBeNull();
  });

  it('rejects a choice from a seat other than the one asked to choose', () => {
    const result = chooseEndgamePrize(stateAwaitingChoice(), 'p2', 'a');
    expect(result.ok).toBe(false);
  });

  it('rejects a prize id that was not one of the tied options', () => {
    const result = chooseEndgamePrize(stateAwaitingChoice(), 'p1', 'nonexistent');
    expect(result.ok).toBe(false);
  });

  it('rejects the choice when no endgame choice is pending', () => {
    const state = makeState({ phase: 'auction-active' });
    const result = chooseEndgamePrize(state, 'p1', 'a');
    expect(result.ok).toBe(false);
  });
});
