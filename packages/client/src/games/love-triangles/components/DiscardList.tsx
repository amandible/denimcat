import type { GameState } from '@denimcat/engine-love-triangles';
import { LINKS } from '@denimcat/engine-love-triangles';

export function DiscardList({ state }: { state: GameState }) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 6 }}>Discarded</h3>
      {state.discardPile.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>None yet.</p>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {state.discardPile.map((linkId) => {
            const link = LINKS[linkId];
            return (
              <span
                key={linkId}
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '3px 6px',
                }}
              >
                {link.a}–{link.b}
              </span>
            );
          })}
        </div>
      )}
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>{state.deck.length} left in the draw deck.</p>
    </div>
  );
}
