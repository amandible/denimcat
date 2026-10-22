import { eligibleTakeSlotIndex, type PriceSlot } from '@denimcat/engine-mint-condition';
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
  // No choice of slot: the engine determines the one slot a prize must come
  // from this round (the priciest occupied slot within the bid) — only its
  // prizes are clickable. If it holds more than one, that's the only real
  // choice here.
  const slotIndex = eligibleTakeSlotIndex(priceSlots, bidAmount);

  return (
    <div className="panel">
      <h3>
        {slotIndex === null
          ? `You won! Nothing displayed is priced within your bid (${bidAmount}).`
          : `You won! Choose a prize from the highlighted slot (price ≤ ${bidAmount}).`}
      </h3>
      <PriceSlotTrack slots={priceSlots} onPrizeClick={onTakePrize} eligibleSlotIndex={slotIndex ?? undefined} />
      {slotIndex === null && (
        <>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 10 }}>You still pay your bid, but take no prize.</p>
          <button className="btn btn-primary" onClick={onSkip} style={{ marginTop: 8 }}>
            Continue without a prize
          </button>
        </>
      )}
    </div>
  );
}
