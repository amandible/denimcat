import { useState } from 'react';
import type { AuctionRewardChoiceV3 } from '@denimcat/engine-mint-condition';

/**
 * v3's reward choice: the card draw is guaranteed (its size depends on
 * which slot tier the bid pointed to — now four tiers, see
 * cardsForRewardTierV3), and the "add a prize" toggle from v2 is gone —
 * only the accelerate option remains. Mirrors PrizeChoicePanelV2.tsx's
 * layout minus that second checkbox. See docs/guides/game-rule-versions.md.
 */
export function PrizeChoicePanelV3({
  bidAmount,
  hasEligiblePrize,
  onChooseReward,
}: {
  bidAmount: number;
  hasEligiblePrize: boolean;
  onChooseReward: (reward: AuctionRewardChoiceV3) => void;
}) {
  const [extraShift, setExtraShift] = useState(false);

  return (
    <div className="panel">
      <h3>You won!</h3>
      {hasEligiblePrize ? (
        <p style={{ marginBottom: 0 }}>Click your prize in the highlighted slot above (price ≤ {bidAmount}).</p>
      ) : (
        <>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Your bid of {bidAmount} points to nothing you can take — you still pay it, but you draw cards instead
            (more for a pricier slot). You can also accelerate the game:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={extraShift} onChange={(e) => setExtraShift(e.target.checked)} />
              Also move all prizes up one extra space
            </label>
          </div>
          <button className="btn btn-primary" onClick={() => onChooseReward({ extraShift })}>
            Confirm
          </button>
        </>
      )}
    </div>
  );
}
