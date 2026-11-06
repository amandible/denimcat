import type { PrizeCard } from '@denimcat/engine-mint-condition';
import { PrizeChip } from './PrizeChip';

/**
 * v2: no placement choice — the new prize always goes into the lowest
 * slot (see MintConditionRuleset.placeNewPrize), so this is just a
 * confirmation rather than a picker. See docs/guides/game-rule-versions.md.
 */
export function NewPrizeSlotPickerV2({ revealedPrize, onConfirm }: { revealedPrize: PrizeCard; onConfirm: () => void }) {
  return (
    <div className="panel">
      <h3>You revealed a new prize</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <PrizeChip prize={revealedPrize} />
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {revealedPrize.color} · {revealedPrize.points} VP
        </span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>It goes into the lowest slot.</p>
      <button className="btn btn-primary" onClick={onConfirm}>
        Confirm
      </button>
    </div>
  );
}
