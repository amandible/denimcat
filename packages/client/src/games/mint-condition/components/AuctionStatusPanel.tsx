import type { MintConditionStateView, SeatId } from '@denimcat/engine-mint-condition';

export function AuctionStatusPanel({
  auction,
  displayLabel,
}: {
  auction: MintConditionStateView['auction'];
  displayLabel: (seat: SeatId) => string;
}) {
  return (
    <div>
      <h3>Auction</h3>
      <p style={{ margin: '4px 0' }}>
        {auction.highestBid
          ? `Highest bid: ${auction.highestBid.amount} by ${displayLabel(auction.highestBid.seat)}`
          : 'No bids yet'}
      </p>
      <p style={{ margin: '4px 0', color: 'var(--muted)', fontSize: 13 }}>
        Turn: {auction.turnOrder.map(displayLabel).join(' → ')}
      </p>
      {auction.passedSeats.length > 0 && (
        <p style={{ margin: '4px 0', color: 'var(--muted)', fontSize: 13 }}>
          Passed: {auction.passedSeats.map(displayLabel).join(', ')}
        </p>
      )}
    </div>
  );
}
