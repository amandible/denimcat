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
  const placeableEmptySlots = new Set(
    priceSlots
      .map((slot, i) => i)
      .filter((i) => priceSlots[i].prizes.length === 0 && (!upperIndices.has(i) || unlockedUpperSlots.includes(i))),
  );

  return (
    <div className="panel">
      <h3>You revealed a new prize — click an empty slot to place it</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <PrizeChip prize={revealedPrize} />
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {revealedPrize.color} · {revealedPrize.points} VP
        </span>
      </div>
      <PriceSlotTrack slots={priceSlots} placeableEmptySlots={placeableEmptySlots} onPlaceInSlot={onPlace} />
    </div>
  );
}
