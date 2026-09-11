import type { PriceSlot } from '@denimcat/engine-mint-condition';
import { PrizeChip } from './PrizeChip';

export function PriceSlotTrack({
  slots,
  onPrizeClick,
  highlightAffordableUpTo,
  placeableEmptySlots,
  onPlaceInSlot,
}: {
  slots: PriceSlot[];
  onPrizeClick?: (prizeId: string) => void;
  /** When set (e.g. the winning bid amount), slots at or below this price are visually called out as affordable. */
  highlightAffordableUpTo?: number;
  /**
   * When set, the track enters "placing a new prize" mode: empty slots at
   * these indices become clickable (via onPlaceInSlot); any other empty
   * slot is shown as locked rather than clickable.
   */
  placeableEmptySlots?: ReadonlySet<number>;
  onPlaceInSlot?: (slotIndex: number) => void;
}) {
  // Vertical, cheapest at the bottom, priciest at the top — matches how
  // this lays out on a physical table. `slots` itself stays ascending by
  // price (index 0 cheapest); only the render order is reversed.
  const bySlotIndexDescending = slots.map((slot, i) => ({ slot, i })).reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 'fit-content' }}>
      {bySlotIndexDescending.map(({ slot, i }) => {
        const affordable = highlightAffordableUpTo !== undefined && slot.price <= highlightAffordableUpTo;
        const isEmpty = slot.prizes.length === 0;
        const isPlaceable = isEmpty && !!placeableEmptySlots?.has(i);
        const isLockedForPlacement = isEmpty && !!placeableEmptySlots && !placeableEmptySlots.has(i);
        return (
          <div
            key={i}
            className="panel"
            onClick={isPlaceable ? () => onPlaceInSlot?.(i) : undefined}
            style={{
              padding: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              border: affordable || isPlaceable ? '2px solid var(--accent)' : undefined,
              cursor: isPlaceable ? 'pointer' : undefined,
              opacity: isLockedForPlacement ? 0.5 : 1,
            }}
          >
            <div style={{ fontSize: 14, color: 'var(--muted)', minWidth: 24, textAlign: 'right' }}>{slot.price}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', minHeight: 66, minWidth: 200 }}>
              {slot.prizes.map((prize) => (
                <PrizeChip key={prize.id} prize={prize} onClick={onPrizeClick && affordable ? () => onPrizeClick(prize.id) : undefined} />
              ))}
              {isPlaceable && <span style={{ color: 'var(--accent)', fontSize: 13 }}>Place here</span>}
              {isLockedForPlacement && <span style={{ color: 'var(--muted)', fontSize: 13 }}>🔒 locked</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
