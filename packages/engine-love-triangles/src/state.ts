import type { GameState, PlayerState, SeatId } from './types';

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clonePlayer(p: PlayerState): PlayerState {
  return { seat: p.seat, gems: p.gems, ownedLinks: [...p.ownedLinks] };
}

export function cloneState(state: GameState): GameState {
  const players = {} as GameState['players'];
  for (const seat of state.seats) {
    players[seat] = clonePlayer(state.players[seat]);
  }
  return {
    seats: [...state.seats],
    players,
    topRow: [...state.topRow],
    bottomRow: [...state.bottomRow],
    deck: [...state.deck],
    turnOrder: [...state.turnOrder],
    activeSeat: state.activeSeat,
    phase: state.phase,
    winner: state.winner ? [...state.winner] : null,
  };
}

/** Fixed round-robin: the next seat after `activeSeat` in `turnOrder`, wrapping around. */
export function nextSeat(turnOrder: SeatId[], activeSeat: SeatId): SeatId {
  const idx = turnOrder.indexOf(activeSeat);
  return turnOrder[(idx + 1) % turnOrder.length];
}
