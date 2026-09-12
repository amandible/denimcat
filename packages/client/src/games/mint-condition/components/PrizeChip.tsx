import type { PrizeCard } from '@denimcat/engine-mint-condition';

const COLOR_VAR: Record<PrizeCard['color'], string> = {
  yellow: 'var(--prize-yellow)',
  blue: 'var(--prize-blue)',
  red: 'var(--prize-red)',
  green: 'var(--prize-green)',
  purple: 'var(--prize-purple)',
  orange: 'var(--prize-orange)',
};

export function PrizeChip({ prize, onClick }: { prize: PrizeCard; onClick?: () => void }) {
  const content = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: COLOR_VAR[prize.color],
        color: 'white',
        fontSize: 12,
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
