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
    discardPile: [...state.discardPile],
    log: [...state.log],
  };
}

export const MAX_LOG_ENTRIES = 300;

/** Appends one human-readable play-by-play line — see GameState.log's doc comment. Mutates in place; caller is expected to already be working on a clone (or brand-new state). */
export function pushLog(state: GameState, message: string): void {
  state.log.push(message);
  if (state.log.length > MAX_LOG_ENTRIES) {
    state.log.splice(0, state.log.length - MAX_LOG_ENTRIES);
  }
}

/** Fixed round-robin: the next seat after `activeSeat` in `turnOrder`, wrapping around. */
export function nextSeat(turnOrder: SeatId[], activeSeat: SeatId): SeatId {
  const idx = turnOrder.indexOf(activeSeat);
  return turnOrder[(idx + 1) % turnOrder.length];
}
