import type { MintConditionStateView } from '@denimcat/engine-mint-condition';
import { seatLabel } from '../seats';

export function AuctionStatusPanel({ auction }: { auction: MintConditionStateView['auction'] }) {
  return (
    <div>
      <h3>Auction</h3>
      <p style={{ margin: '4px 0' }}>
        {auction.highestBid
          ? `Highest bid: ${auction.highestBid.amount} by ${seatLabel(auction.highestBid.seat)}`
          : 'No bids yet'}
      </p>
      <p style={{ margin: '4px 0', color: 'var(--muted)', fontSize: 13 }}>
        Turn: {auction.turnOrder.map(seatLabel).join(' → ')}
      </p>
      {auction.passedSeats.length > 0 && (
        <p style={{ margin: '4px 0', color: 'var(--muted)', fontSize: 13 }}>
          Passed: {auction.passedSeats.map(seatLabel).join(', ')}
        </p>
      )}
    </div>
  );
}
