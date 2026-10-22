import type { PriceSlot, PrizeCard } from '@denimcat/engine-mint-condition';
import { PrizeChip } from './PrizeChip';
import { PriceSlotTrack } from './PriceSlotTrack';

export function NewPrizeSlotPicker({
  revealedPrize,
  priceSlots,
  unlockedUpperSlots,
  onPlace,
}: {
  revealedPrize: PrizeCard;
  priceSlots: PriceSlot[];
  unlockedUpperSlots: number[];
  onPlace: (slotIndex: number) => void;
}) {
  const lastIndex = priceSlots.length - 1;
  const upperIndices = new Set([lastIndex - 1, lastIndex]);
  // Any unlocked slot is a legal target, occupied or not — placing can
  // stack the new prize alongside whatever's already there.
  const placeableSlots = new Set(
    priceSlots.map((_, i) => i).filter((i) => !upperIndices.has(i) || unlockedUpperSlots.includes(i)),
  );

  return (
    <div className="panel">
      <h3>You revealed a new prize — click a slot to place it (an occupied one stacks it there)</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <PrizeChip prize={revealedPrize} />
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {revealedPrize.color} · {revealedPrize.points} VP
        </span>
      </div>
      <PriceSlotTrack slots={priceSlots} placeableSlots={placeableSlots} onPlaceInSlot={onPlace} />
    </div>
  );
}
