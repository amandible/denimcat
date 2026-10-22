import type { PrizeCard } from '@denimcat/engine-mint-condition';
import { PrizeChip } from './PrizeChip';

/**
 * No board shown here — the main display's own PriceSlotTrack marks every
 * placeable slot (locked ones greyed out) and handles the actual click (see
 * GameView, which wires placeableSlots/onPlaceInSlot onto it). This panel
 * just reminds the winner what they're placing, since it isn't on the
 * board yet.
 */
export function NewPrizeSlotPicker({ revealedPrize }: { revealedPrize: PrizeCard }) {
  return (
    <div className="panel">
      <h3>You revealed a new prize</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <PrizeChip prize={revealedPrize} />
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {revealedPrize.color} · {revealedPrize.points} VP
        </span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
        Click a slot above to place it — an occupied one stacks it there.
      </p>
    </div>
  );
}
