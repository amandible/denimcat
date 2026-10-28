import type { DeckId, Direction } from './types';

export const DECK_ROTATIONS: Record<DeckId, readonly Direction[]> = {
  A: ['up', 'left', 'right', 'down'],
  B: ['left', 'right', 'down', 'up'],
  C: ['right', 'down', 'up', 'left'],
  D: ['down', 'up', 'left', 'right'],
};

export function directionFor(deck: DeckId, value: number): Direction {
  return DECK_ROTATIONS[deck][(value - 1) % 4];
}
