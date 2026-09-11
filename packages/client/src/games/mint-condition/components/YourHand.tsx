export function YourHand({ hand }: { hand: number[] }) {
  return (
    <div>
      <h3>Your Hand</h3>
      {hand.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Empty</p>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hand.map((value, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 66,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--panel-bg)',
                fontSize: 20,
                fontWeight: 'bold',
              }}
            >
              {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
