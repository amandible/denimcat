export function YourHand({ hand }: { hand: number[] }) {
  return (
    <div>
      <h3>Your Hand</h3>
      {hand.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Empty</p>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          {hand.map((value, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 44,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--panel-bg)',
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
