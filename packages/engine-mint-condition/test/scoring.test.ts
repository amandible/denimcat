import { describe, expect, it } from 'vitest';
import { computeFinalScores, computeScore, determineWinners, isGameOver } from '../src/scoring';
import { makeState, prize } from './helpers';

describe('computeScore', () => {
  it('sums prize points with no color bonus for an empty collection', () => {
    const state = makeState({ players: { p1: { wonPrizes: [] } } });
    expect(computeScore(state, 'p1')).toBe(0);
  });

  it('adds a color bonus equal to the count of the most common color', () => {
    // 3 red (1+1+1=3 base) + 1 blue (2 base) = 5 base; most common color is red with 3 -> +3
    const state = makeState({
      players: {
        p1: {
          wonPrizes: [prize('r1', 'red', 1), prize('r2', 'red', 1), prize('r3', 'red', 1), prize('b1', 'blue', 2)],
        },
      },
    });
    expect(computeScore(state, 'p1')).toBe(5 + 3);
  });

  it('gives the same bonus regardless of which color is tied for most common', () => {
    const state = makeState({
      players: { p1: { wonPrizes: [prize('r1', 'red', 2), prize('b1', 'blue', 2)] } },
    });
    // base 4, tie for most common at count 1 each -> bonus 1, no branching needed
    expect(computeScore(state, 'p1')).toBe(4 + 1);
  });
});

describe('determineWinners', () => {
  it('returns the single highest scorer', () => {
    const state = makeState({
      players: {
        p1: { wonPrizes: [prize('a', 'red', 5)] },
        p2: { wonPrizes: [prize('b', 'blue', 1)] },
      },
    });
    expect(determineWinners(state)).toEqual(['p1']);
  });

  it('returns every tied seat on a shared win', () => {
    const state = makeState({
      players: {
        p1: { wonPrizes: [prize('a', 'red', 3)] },
        p2: { wonPrizes: [prize('b', 'blue', 3)] },
      },
    });
    expect(determineWinners(state).sort()).toEqual(['p1', 'p2']);
  });
});

describe('isGameOver', () => {
  it('is false while the prize deck still has cards', () => {
    const state = makeState({ prizeDeck: [prize('x', 'red', 1)] });
    expect(isGameOver(state)).toBe(false);
  });

  it('is false while any price slot still holds a prize', () => {
    const state = makeState({
      prizeDeck: [],
      priceSlots: [
        { price: 1, prizes: [] },
        { price: 2, prizes: [prize('x', 'red', 1)] },
        { price: 3, prizes: [] },
        { price: 4, prizes: [] },
        { price: 5, prizes: [] },
        { price: 6, prizes: [] },
      ],
    });
    expect(isGameOver(state)).toBe(false);
  });

  it('is true once both the deck and every slot are empty', () => {
    const state = makeState({ prizeDeck: [] });
    expect(isGameOver(state)).toBe(true);
  });
});

describe('computeFinalScores', () => {
  it('computes a score for every seat', () => {
    const state = makeState({
      seats: ['p1', 'p2', 'p3'],
      players: {
        p1: { wonPrizes: [prize('a', 'red', 2)] },
        p2: { wonPrizes: [] },
        p3: { wonPrizes: [prize('c', 'blue', 1)] },
      },
    });
    expect(computeFinalScores(state)).toEqual({ p1: 2 + 1, p2: 0, p3: 1 + 1 });
  });
});
