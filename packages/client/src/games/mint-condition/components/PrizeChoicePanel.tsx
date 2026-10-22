/**
 * No board shown here — the main display's own PriceSlotTrack highlights
 * the one eligible slot and handles the actual click (see GameView, which
 * wires eligibleSlotIndex/onPrizeClick onto it). This panel is just the
 * instruction and the skip fallback.
 */
export function PrizeChoicePanel({
  bidAmount,
  hasEligiblePrize,
  onSkip,
}: {
  bidAmount: number;
  hasEligiblePrize: boolean;
  onSkip: () => void;
}) {
  return (
    <div className="panel">
      <h3>You won!</h3>
      {hasEligiblePrize ? (
        <p style={{ marginBottom: 0 }}>Click your prize in the highlighted slot above (price ≤ {bidAmount}).</p>
      ) : (
        <>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Nothing displayed is priced within your bid ({bidAmount}) — you still pay it, but take no prize.
          </p>
          <button className="btn btn-primary" onClick={onSkip} style={{ marginTop: 8 }}>
            Continue without a prize
          </button>
        </>
      )}
    </div>
  );
}
