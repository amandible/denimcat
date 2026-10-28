import type { CellId } from './board';

export type Direction = 'up' | 'left' | 'right' | 'down';
export type DeckId = 'A' | 'B' | 'C' | 'D';
export type SeatId = 'p1' | 'p2' | 'p3' | 'p4';
export type PlayerCount = 2 | 3 | 4;

export interface CellState {
  value: number;
  owner: SeatId | 'neutral';
}

export interface PlayerState {
  seat: SeatId;
  deckId: DeckId;
  hand: number[];
  deck: number[];
  score: number;
}

export interface GameState {
  seats: SeatId[];
  players: Record<SeatId, PlayerState>;
  cells: Record<CellId, CellState>;
  pawnCell: CellId;
  activeSeat: SeatId;
  phase: 'playing' | 'ended';
  winner: SeatId[] | null;
  log: string[];
}
