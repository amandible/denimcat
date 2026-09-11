import type { PriceSlot } from '@denimcat/engine-mint-condition';
import { PrizeChip } from './PrizeChip';

export function PriceSlotTrack({
  slots,
  onPrizeClick,
  highlightAffordableUpTo,
}: {
  slots: PriceSlot[];
  onPrizeClick?: (prizeId: string) => void;
  /** When set (e.g. the winning bid amount), slots at or below this price are visually called out as affordable. */
  highlightAffordableUpTo?: number;
}) {
  // Vertical, cheapest at the bottom, priciest at the top — matches how
  // this lays out on a physical table. `slots` itself stays ascending by
  // price (index 0 cheapest); only the render order is reversed.
  const bySlotIndexDescending = slots.map((slot, i) => ({ slot, i })).reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 'fit-content' }}>
      {bySlotIndexDescending.map(({ slot, i }) => {
        const affordable = highlightAffordableUpTo !== undefined && slot.price <= highlightAffordableUpTo;
        return (
          <div
            key={i}
            className="panel"
            style={{
              padding: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              border: affordable ? '2px solid var(--accent)' : undefined,
            }}
          >
            <div style={{ fontSize: 14, color: 'var(--muted)', minWidth: 24, textAlign: 'right' }}>{slot.price}</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', minHeight: 30, minWidth: 120 }}>
              {slot.prizes.map((prize) => (
                <PrizeChip key={prize.id} prize={prize} onClick={onPrizeClick && affordable ? () => onPrizeClick(prize.id) : undefined} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
