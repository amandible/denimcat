import type { GameState, LinkId, SeatId } from '@denimcat/engine-love-triangles';
import { effectiveCost, LINKS } from '@denimcat/engine-love-triangles';
import { SEAT_COLOR_VAR } from './seatColors';

export interface CostSegment {
  amount: number;
  color: string;
}

/**
 * Breaks an effective cost into colored segments — base cost (neutral),
 * then the buyer's own presence surcharge (in their color), then each
 * opponent's presence surcharge (in that opponent's color) — e.g. 4+2+1.
 * An experiment in making "why does this cost more than the printed
 * price" legible at a glance; expect this to get tuned further.
 */
export function costSegments(state: GameState, linkId: LinkId, buyer: SeatId): CostSegment[] {
  const baseCost = LINKS[linkId].baseCost;
  const cost = effectiveCost(state, linkId, buyer);
  const segments: CostSegment[] = [{ amount: baseCost, color: 'var(--muted)' }];

  const selfSurcharge = cost.paidToBank - baseCost;
  if (selfSurcharge > 0) segments.push({ amount: selfSurcharge, color: SEAT_COLOR_VAR[buyer] });

  for (const seat of state.seats) {
    const amount = cost.paidToOpponents[seat];
    if (amount) segments.push({ amount, color: SEAT_COLOR_VAR[seat] });
  }

  return segments;
}
