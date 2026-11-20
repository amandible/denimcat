import { describe, expect, it } from 'vitest';
import { cloneState } from '../src/state';
import { makeState } from './helpers';
import type { GameState } from '../src/types';

describe('cloneState', () => {
  it('tolerates a player persisted before v3 added PlayerState.discard, instead of throwing', () => {
    const state = makeState({ players: { p1: { hand: [5] } } });
    // Simulate a room's GameState loaded from storage written before this
    // field existed — the stored object literally has no `discard` key.
    delete (state.players.p1 as Partial<GameState['players']['p1']>).discard;

    const next = cloneState(state);
    expect(next.players.p1.discard).toEqual([]);
  });
});
