import { useState } from 'react';
import type { AuctionRewardChoiceV2 } from '@denimcat/engine-mint-condition';

/**
 * v2's reward choice: the card draw is guaranteed (its size depends on
 * which slot tier the bid pointed to, decided server-side), and the
 * player may independently toggle two extras before confirming. Mirrors
 * PrizeChoicePanel.tsx's layout (same "no board shown here" reasoning),
 * but needs its own Confirm step since there's more than one toggle to
 * set before sending the choice. See docs/guides/game-rule-versions.md.
 */
export function PrizeChoicePanelV2({
  bidAmount,
  hasEligiblePrize,
  onChooseReward,
}: {
  bidAmount: number;
  hasEligiblePrize: boolean;
  onChooseReward: (reward: AuctionRewardChoiceV2) => void;
}) {
  const [extraShift, setExtraShift] = useState(false);
  const [addPrize, setAddPrize] = useState(false);

  return (
    <div className="panel">
      <h3>You won!</h3>
      {hasEligiblePrize ? (
        <p style={{ marginBottom: 0 }}>Click your prize in the highlighted slot above (price ≤ {bidAmount}).</p>
      ) : (
        <>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Your bid of {bidAmount} points to nothing you can take — you still pay it, but you draw cards instead
            (more for a pricier slot). You can also pick either or both of these extras:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={extraShift} onChange={(e) => setExtraShift(e.target.checked)} />
              Also move all prizes up one extra space
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={addPrize} onChange={(e) => setAddPrize(e.target.checked)} />
              Also add an extra prize to the lowest slot
            </label>
          </div>
          <button className="btn btn-primary" onClick={() => onChooseReward({ extraShift, addPrize })}>
            Confirm
          </button>
        </>
      )}
    </div>
  );
}
