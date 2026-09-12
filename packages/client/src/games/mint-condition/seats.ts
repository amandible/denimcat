import type { SeatId } from '@denimcat/engine-mint-condition';

const LABELS: Record<SeatId, string> = {
  p1: 'Player 1',
  p2: 'Player 2',
  p3: 'Player 3',
  p4: 'Player 4',
};

const ACCENTS: Record<SeatId, string> = {
  p1: 'var(--seat-1)',
  p2: 'var(--seat-2)',
  p3: 'var(--seat-3)',
  p4: 'var(--seat-4)',
};

export function seatLabel(seat: SeatId): string {
  return LABELS[seat];
}

export function seatAccent(seat: SeatId): string {
  return ACCENTS[seat];
}

export const CANDIDATE_SEATS: SeatId[] = ['p1', 'p2', 'p3', 'p4'];
