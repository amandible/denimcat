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
// distinct component rather than a small UI chip. v3 added a flavor name
// per card (see PrizeCard.name) — shown inline, under the point value,
// rather than only in the hover tooltip, per the designer's preference.
export function PrizeChip({ prize, onClick }: { prize: PrizeCard; onClick?: () => void }) {
  const content = (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: 72,
        height: 88,
        padding: '4px 6px',
        borderRadius: 6,
        background: COLOR_VAR[prize.color],
        color: 'white',
        border: '2px solid white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        textAlign: 'center',
      }}
      title={`${prize.name} — ${prize.color} · ${prize.points} VP`}
    >
      <span style={{ fontSize: 18, fontWeight: 'bold', lineHeight: 1.1 }}>{prize.points}</span>
      <span style={{ fontSize: 10, lineHeight: 1.15, marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
        {prize.name}
      </span>
    </span>
  );

  if (!onClick) return content;
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
      {content}
    </button>
  );
}
