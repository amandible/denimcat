import { describe, expect, it } from 'vitest';
import { computeFinalScores, determineWinners, isGameOver } from '../src/scoring';
import { makeState } from './helpers';

describe('isGameOver', () => {
  it('false while any seat still has cards in hand or deck', () => {
    const state = makeState({ players: { p1: { hand: [], deck: [3] }, p2: { hand: [], deck: [] } } });
    expect(isGameOver(state)).toBe(false);
  });
  it('true only once every seat\'s hand and deck are both empty', () => {
    const state = makeState({ players: { p1: { hand: [], deck: [] }, p2: { hand: [], deck: [] } } });
    expect(isGameOver(state)).toBe(true);
  });
});

describe('computeFinalScores', () => {
  it('adds 1 point per cell the seat currently owns on top, on top of their accumulated score', () => {
    const state = makeState({
      players: { p1: { score: 5 }, p2: { score: 5 } },
      cells: { '0-0': { value: 9, owner: 'p1' }, '0-1': { value: 3, owner: 'p1' }, '0-2': { value: 7, owner: 'p2' } },
    });
    const scores = computeFinalScores(state);
    expect(scores.p1).toBe(7); // 5 + 2 visible cards
    expect(scores.p2).toBe(6); // 5 + 1 visible card
  });
});

describe('determineWinners', () => {
  it('a single highest score wins alone', () => {
    expect(determineWinners({ p1: 10, p2: 7 })).toEqual(['p1']);
  });
  it('a tie for highest is a shared win', () => {
    expect(determineWinners({ p1: 10, p2: 10, p3: 3 }).sort()).toEqual(['p1', 'p2']);
  });
});
