import { bidOptionsForHand } from '@denimcat/engine-mint-condition';

export function BidOptionsList({
  hand,
  currentBidAmount,
  onBid,
  onHoverAmount,
}: {
  hand: number[];
  currentBidAmount: number;
  onBid: (cards: number[]) => void;
  /** Called with the bid amount under the pointer (or null on leave) — lets the main board preview which slot that bid would point to. */
  onHoverAmount?: (amount: number | null) => void;
}) {
  const options = bidOptionsForHand(hand, currentBidAmount).sort((a, b) => a.amount - b.amount);

  if (options.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No bid in your hand beats the current bid — you can only pass.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
      {options.map((option, i) => (
        <button
          key={i}
          className="btn"
          onClick={() => onBid(option.cards)}
          onMouseEnter={() => onHoverAmount?.(option.amount)}
          onMouseLeave={() => onHoverAmount?.(null)}
          style={{ textAlign: 'left' }}
        >
          Bid {option.amount} <span style={{ color: 'var(--muted)', fontSize: 12 }}>({option.cards.join(' + ')})</span>
        </button>
      ))}
    </div>
  );
}
