import { useEffect } from 'react';

/**
 * A dismissible rules reference, shared by any game whose rules dialog
 * should just be the game's own written rules rather than a reformulated
 * player-facing summary (contrast Hyper Bloom's RulesModal, which is a
 * deliberately fresh rewrite). `children` is the actual rules content.
 */
export function RulesModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="panel"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640, maxHeight: '85vh', width: '100%', display: 'flex', flexDirection: 'column', padding: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
          <h3 style={{ margin: 0 }}>Rules</h3>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ overflowY: 'auto', fontSize: 13, lineHeight: 1.5 }}>{children}</div>
      </div>
    </div>
  );
}
