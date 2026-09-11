import type { PrizeCard } from '@denimcat/engine-mint-condition';

const COLOR_VAR: Record<PrizeCard['color'], string> = {
  yellow: 'var(--prize-yellow)',
  blue: 'var(--prize-blue)',
  red: 'var(--prize-red)',
  green: 'var(--prize-green)',
  purple: 'var(--prize-purple)',
  orange: 'var(--prize-orange)',
};

// A physical prize card in the real prototype — sized and shaped (a
// rectangle, rounded less than the .panel slots it sits in) to read as a
// distinct component rather than a small UI chip.
export function PrizeChip({ prize, onClick }: { prize: PrizeCard; onClick?: () => void }) {
  const content = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 48,
        height: 66,
        borderRadius: 6,
        background: COLOR_VAR[prize.color],
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        border: '2px solid white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }}
      title={`${prize.color} · ${prize.points} VP`}
    >
      {prize.points}
    </span>
  );

  if (!onClick) return content;
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
      {content}
    </button>
  );
}
