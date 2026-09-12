import type { PriceSlot, PrizeCard } from '@denimcat/engine-mint-condition';
import { PrizeChip } from './PrizeChip';

export function NewPrizeSlotPicker({
  revealedPrize,
  priceSlots,
  onPlace,
}: {
  revealedPrize: PrizeCard;
  priceSlots: PriceSlot[];
  onPlace: (slotIndex: number) => void;
}) {
  return (
    <div className="panel">
      <h3>You revealed a new prize — choose an empty slot for it</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <PrizeChip prize={revealedPrize} />
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {revealedPrize.color} · {revealedPrize.points} VP
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {priceSlots.map((slot, i) => {
          const empty = slot.prizes.length === 0;
          return (
            <button
              key={i}
              className="btn"
              disabled={!empty}
              onClick={() => onPlace(i)}
              style={{ minWidth: 64, textAlign: 'center' }}
            >
              {slot.price}
            </button>
          );
        })}
      </div>
    </div>
  );
}
