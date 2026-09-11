import { describe, expect, it } from 'vitest';
import { determineWinners, isGameOver, scoreForPlayer } from '../src/scoring';
import { makeState } from './helpers';

describe('scoreForPlayer', () => {
  it('scores exactly 2 for a player who owns no links at all (any map node is a trivial 1-node loop)', () => {
    const state = makeState({ players: { p1: { ownedLinks: [] } } });
    expect(scoreForPlayer(state, 'p1')).toBe(2);
  });

  it('scores a loopless tree via the trivial 1-node loop: 2 for the node, +1 per other reachable node', () => {
    // A-B-C: a path, no cycle. Confirmed reading: pick any node in it as the
    // trivial loop, every other node in the tree is still "reachable."
    const state = makeState({ players: { p1: { ownedLinks: ['A-B', 'B-C'] } } });
    expect(scoreForPlayer(state, 'p1')).toBe(4); // 1 (loop) + 3 (component) = 2*1 + 2 reachable
  });

  it('scores a real triangle at 2 points per node with nothing extra to reach', () => {
    const state = makeState({ players: { p1: { ownedLinks: ['A-B', 'A-D', 'B-D'] } } });
    expect(scoreForPlayer(state, 'p1')).toBe(6); // 2*3 + 0 reachable extra
  });

  it('picks whichever component scores highest, even when both have same-size loops', () => {
    // Component 1: a bare triangle A-B-D (3 nodes) -> 3 + 3 = 6.
    // Component 2: a triangle E-G-H (3 nodes) plus a pendant F off H (4
    // nodes total) -> 3 + 4 = 7. Same max cycle size (3) in both, but the
    // second component's extra reachable node makes it score higher.
    const state = makeState({
      players: {
        p1: { ownedLinks: ['A-B', 'A-D', 'B-D', 'E-G', 'E-H', 'G-H', 'F-H'] },
      },
    });
    expect(scoreForPlayer(state, 'p1')).toBe(7);
  });
});

describe('isGameOver / determineWinners', () => {
  it('is over only when both rows are completely empty', () => {
    expect(isGameOver(makeState({ topRow: [null, null, null], bottomRow: [null, null, null] }))).toBe(true);
    expect(isGameOver(makeState({ topRow: ['A-B', null, null], bottomRow: [null, null, null] }))).toBe(false);
  });

  it('the higher network score wins outright', () => {
    const state = makeState({
      players: {
        p1: { ownedLinks: ['A-B', 'A-D', 'B-D'], gems: 3 }, // score 6
        p2: { ownedLinks: [], gems: 20 }, // score 2, but way more gems
      },
    });
    expect(determineWinners(state)).toEqual(['p1']);
  });

  it('breaks a tied network score by remaining gems', () => {
    const state = makeState({
      players: {
        p1: { ownedLinks: [], gems: 5 },
        p2: { ownedLinks: [], gems: 8 },
      },
    });
    expect(determineWinners(state)).toEqual(['p2']);
  });

  it('shares the victory when both score and gems are tied', () => {
    const state = makeState({
      players: {
        p1: { ownedLinks: [], gems: 5 },
        p2: { ownedLinks: [], gems: 5 },
      },
    });
    expect(determineWinners(state).sort()).toEqual(['p1', 'p2']);
  });
});
