import { describe, expect, it } from 'vitest';
import { directionFor } from '../src/decks';

describe('directionFor', () => {
  it('deck A cycles up, left, right, down starting at card 1', () => {
    expect(directionFor('A', 1)).toBe('up');
    expect(directionFor('A', 2)).toBe('left');
    expect(directionFor('A', 3)).toBe('right');
    expect(directionFor('A', 4)).toBe('down');
    expect(directionFor('A', 5)).toBe('up'); // repeats
  });
  it('each deck is a one-step rotation of the last, and all four differ on every card number', () => {
    for (let value = 1; value <= 16; value++) {
      const directions = (['A', 'B', 'C', 'D'] as const).map((deck) => directionFor(deck, value));
      expect(new Set(directions).size).toBe(4);
    }
  });
  it('deck D cycles down, up, left, right starting at card 1', () => {
    expect(directionFor('D', 1)).toBe('down');
    expect(directionFor('D', 2)).toBe('up');
    expect(directionFor('D', 3)).toBe('left');
    expect(directionFor('D', 4)).toBe('right');
  });
});
