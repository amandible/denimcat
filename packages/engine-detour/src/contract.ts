import type { ActionResult, RoomLifecycleClientToServerEvents, RoomLifecycleServerToClientEvents } from '@denimcat/shared';
import type { CellId } from './board';
import type { CellState, DeckId, GameState, PlayerCount, SeatId } from './types';

export interface DetourConfig {
  playerCount: PlayerCount;
}

export interface DetourPlayerView {
  seat: SeatId;
  deckId: DeckId;
  handSize: number;
  /** Present only when this is the viewer's own seat. */
  hand?: number[];
  deckSize: number;
  score: number;
}

/**
 * The board, pawn position, and every seat's assigned deck rotation are
 * fully public (laid out face-up on the table) — only each seat's hand
 * *contents* are hidden from everyone but that seat.
 */
export interface DetourStateView {
  seats: SeatId[];
  players: Record<SeatId, DetourPlayerView>;
  cells: Record<CellId, CellState>;
  pawnCell: CellId;
  activeSeat: SeatId;
  phase: 'playing' | 'ended';
  winner: SeatId[] | null;
  log: string[];
}

export function toView(state: GameState, viewer: SeatId | 'spectator'): DetourStateView {
  const players = {} as Record<SeatId, DetourPlayerView>;
  for (const seat of state.seats) {
    const p = state.players[seat];
    const isOwner = viewer === seat;
    players[seat] = {
      seat,
      deckId: p.deckId,
      handSize: p.hand.length,
      hand: isOwner ? [...p.hand] : undefined,
      deckSize: p.deck.length,
      score: p.score,
    };
  }

  const cells = {} as Record<CellId, CellState>;
  for (const [cellId, cell] of Object.entries(state.cells)) {
    cells[cellId] = { value: cell.value, owner: cell.owner };
  }

  return {
    seats: [...state.seats],
    players,
    cells,
    pawnCell: state.pawnCell,
    activeSeat: state.activeSeat,
    phase: state.phase,
    winner: state.winner ? [...state.winner] : null,
    log: [...state.log],
  };
}

export interface ClientToServerEvents extends RoomLifecycleClientToServerEvents<SeatId, DetourConfig, DetourStateView> {
  play_card: (payload: { roomCode: string; value: number; target: string }, cb: (res: ActionResult) => void) => void;
}

export type ServerToClientEvents = RoomLifecycleServerToClientEvents<SeatId, DetourStateView>;
