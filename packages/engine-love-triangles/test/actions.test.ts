import { describe, expect, it } from 'vitest';
import { buyLink, pass } from '../src/actions';
import { makeState } from './helpers';

describe('pass', () => {
  it('gains two gems and advances the turn', () => {
    const state = makeState({ seats: ['p1', 'p2'], activeSeat: 'p1', players: { p1: { gems: 5 } } });
    const result = pass(state, 'p1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.p1.gems).toBe(7);
    expect(result.state.activeSeat).toBe('p2');
  });

  it("rejects acting out of turn", () => {
    const state = makeState({ seats: ['p1', 'p2'], activeSeat: 'p1' });
    expect(pass(state, 'p2').ok).toBe(false);
  });
});

describe('buyLink', () => {
  it('deducts the effective cost, records ownership, clears and refills the slot, and advances the turn', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      activeSeat: 'p1',
      players: { p1: { gems: 10 } },
      topRow: ['A-B', 'B-G', 'G-J'], // A-B base cost 4, nobody present anywhere -> cost 4
      bottomRow: ['H-I', 'H-J', 'I-J'],
      deck: ['C-I'],
    });

    const result = buyLink(state, 'p1', 'A-B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.p1.gems).toBe(6);
    expect(result.state.players.p1.ownedLinks).toEqual(['A-B']);
    expect(result.state.topRow).toEqual(['H-I', 'B-G', 'G-J']); // promoted
    expect(result.state.bottomRow).toEqual(['C-I', 'H-J', 'I-J']); // drawn
    expect(result.state.activeSeat).toBe('p2');
  });

  it('pays presence surcharges to the bank and to opponents as part of the same purchase', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      activeSeat: 'p1',
      players: {
        p1: { gems: 20, ownedLinks: ['B-D', 'C-F'] }, // present at B and C
        p2: { gems: 3, ownedLinks: ['C-I'] }, // present at C
      },
      topRow: ['B-C', 'A-B', 'G-J'], // B-C base cost 5
      bottomRow: [null, null, null],
      deck: [],
    });

    const result = buyLink(state, 'p1', 'B-C');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // total 8 (5 base + self@B + self@C + p2@C); 7 to bank, 1 to p2.
    expect(result.state.players.p1.gems).toBe(20 - 8);
    expect(result.state.players.p2.gems).toBe(3 + 1);
  });

  it('rejects buying a link that is not in the top row', () => {
    const state = makeState({ topRow: ['A-B', null, null], bottomRow: ['B-G', null, null] });
    expect(buyLink(state, 'p1', 'B-G').ok).toBe(false);
  });

  it('rejects buying without enough gems', () => {
    const state = makeState({ players: { p1: { gems: 1 } }, topRow: ['A-J', null, null] }); // A-J costs 8
    expect(buyLink(state, 'p1', 'A-J').ok).toBe(false);
  });

  it('rejects acting out of turn', () => {
    const state = makeState({ seats: ['p1', 'p2'], activeSeat: 'p1', topRow: ['A-B', null, null] });
    expect(buyLink(state, 'p2', 'A-B').ok).toBe(false);
  });

  it('ends the game and determines a winner once buying empties the whole display', () => {
    const state = makeState({
      seats: ['p1', 'p2'],
      activeSeat: 'p1',
      players: { p1: { gems: 10 } },
      topRow: ['A-B', null, null],
      bottomRow: [null, null, null],
      deck: [],
    });

    const result = buyLink(state, 'p1', 'A-B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('ended');
    expect(result.state.winner).not.toBeNull();
  });
});
