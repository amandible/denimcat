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
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {slots.map((slot, i) => {
        const affordable = highlightAffordableUpTo !== undefined && slot.price <= highlightAffordableUpTo;
        return (
          <div
            key={i}
            className="panel"
            style={{
              padding: 10,
              minWidth: 64,
              textAlign: 'center',
              border: affordable ? '2px solid var(--accent)' : undefined,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{slot.price}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', minHeight: 30 }}>
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
