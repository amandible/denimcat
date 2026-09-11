import type { GameState, LinkId, PlayerState, SeatId } from '../src/types';

export function makePlayer(seat: SeatId, overrides: Partial<PlayerState> = {}): PlayerState {
  return { seat, gems: 10, ownedLinks: [], ...overrides };
}

export function makeState(
  overrides: {
    seats?: SeatId[];
    players?: Partial<Record<SeatId, Partial<PlayerState>>>;
    topRow?: (LinkId | null)[];
    bottomRow?: (LinkId | null)[];
    deck?: LinkId[];
    turnOrder?: SeatId[];
    activeSeat?: SeatId;
    phase?: GameState['phase'];
    winner?: SeatId[] | null;
  } = {},
): GameState {
  const seats = overrides.seats ?? ['p1', 'p2'];
  const players = {} as GameState['players'];
  for (const seat of seats) {
    players[seat] = makePlayer(seat, overrides.players?.[seat]);
  }
  return {
    seats,
    players,
    topRow: overrides.topRow ?? [null, null, null],
    bottomRow: overrides.bottomRow ?? [null, null, null],
    deck: overrides.deck ?? [],
    turnOrder: overrides.turnOrder ?? seats,
    activeSeat: overrides.activeSeat ?? seats[0],
    phase: overrides.phase ?? 'playing',
    winner: overrides.winner ?? null,
  };
}
