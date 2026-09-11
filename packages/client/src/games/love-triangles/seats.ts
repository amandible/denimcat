import type { SeatId } from '@denimcat/engine-love-triangles';

const LABELS: Record<SeatId, string> = {
  p1: 'Player 1',
  p2: 'Player 2',
  p3: 'Player 3',
  p4: 'Player 4',
};

export function seatLabel(seat: SeatId): string {
  return LABELS[seat];
}

export const CANDIDATE_SEATS: SeatId[] = ['p1', 'p2', 'p3', 'p4'];
