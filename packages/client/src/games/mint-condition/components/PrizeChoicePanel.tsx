import type { PriceSlot } from '@denimcat/engine-mint-condition';
import { PriceSlotTrack } from './PriceSlotTrack';

export function PrizeChoicePanel({
  priceSlots,
  bidAmount,
  onTakePrize,
  onSkip,
}: {
  priceSlots: PriceSlot[];
  bidAmount: number;
  onTakePrize: (prizeId: string) => void;
  onSkip: () => void;
}) {
  const anyAffordable = priceSlots.some((slot) => slot.price <= bidAmount && slot.prizes.length > 0);

  return (
    <div className="panel">
      <h3>You won! Choose a prize (price ≤ {bidAmount})</h3>
      <PriceSlotTrack slots={priceSlots} onPrizeClick={onTakePrize} highlightAffordableUpTo={bidAmount} />
      {!anyAffordable && (
        <>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 10 }}>
            Nothing displayed is priced within your bid — you still pay it, but take no prize.
          </p>
          <button className="btn btn-primary" onClick={onSkip} style={{ marginTop: 8 }}>
            Continue without a prize
          </button>
        </>
      )}
    </div>
  );
}
