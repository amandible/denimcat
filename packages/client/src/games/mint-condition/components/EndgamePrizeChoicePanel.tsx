import type { PrizeCard } from '@denimcat/engine-mint-condition';
import { PrizeChip } from './PrizeChip';

/**
 * v3's endgame tie-break: the richest-in-hand seat picks which of the
 * tied-for-cheapest displayed prizes to take — a real player decision
 * (confirmed with the designer), not an automatic pick, since which color
 * is more valuable to them depends on what they've already collected.
 */
export function EndgamePrizeChoicePanel({
  tiedPrizes,
  onChoose,
}: {
  tiedPrizes: PrizeCard[];
  onChoose: (prizeId: string) => void;
}) {
  return (
    <div className="panel">
      <h3>You have the most money left</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        The prize deck just ran out. These prizes are tied for cheapest in the display — pick the one you want:
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tiedPrizes.map((prize) => (
          <PrizeChip key={prize.id} prize={prize} onClick={() => onChoose(prize.id)} />
        ))}
      </div>
    </div>
  );
}
