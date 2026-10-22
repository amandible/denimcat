import type { AuctionReward } from '@denimcat/engine-mint-condition';

const REWARD_LABELS: Record<AuctionReward, string> = {
  draw_cards: 'Draw two money cards',
  extra_shift: 'Move all prizes up one extra space',
  add_prizes: 'Add two prizes to the lowest slot',
};

/**
 * No board shown here — the main display's own PriceSlotTrack highlights
 * the one eligible slot and handles the actual click (see GameView, which
 * wires eligibleSlotIndex/onPrizeClick onto it). This panel is just the
 * instruction, or — when the bid points to nothing (an empty slot, or
 * below the lowest slot's price) — the three-way consolation reward
 * choice, per the designer's rule.
 */
export function PrizeChoicePanel({
  bidAmount,
  hasEligiblePrize,
  onChooseReward,
}: {
  bidAmount: number;
  hasEligiblePrize: boolean;
  onChooseReward: (reward: AuctionReward) => void;
}) {
  return (
    <div className="panel">
      <h3>You won!</h3>
      {hasEligiblePrize ? (
        <p style={{ marginBottom: 0 }}>Click your prize in the highlighted slot above (price ≤ {bidAmount}).</p>
      ) : (
        <>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Your bid of {bidAmount} points to nothing you can take — you still pay it, but choose a reward instead:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(Object.keys(REWARD_LABELS) as AuctionReward[]).map((reward) => (
              <button key={reward} className="btn btn-primary" onClick={() => onChooseReward(reward)}>
                {REWARD_LABELS[reward]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
