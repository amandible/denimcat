import type { GameState, LinkId } from '@denimcat/engine-love-triangles';
import { effectiveCost, LINKS } from '@denimcat/engine-love-triangles';
import { costSegments } from '../costSegments';

/**
 * Kept intentionally simple for now — text rather than a mini-map-per-card
 * render like the physical prototype's cards. Worth revisiting once the
 * core interaction and animation feel are solid, not before.
 */
export function DisplayTrack({
  state,
  onBuy,
  canBuy,
  doomedLinkId,
  onHoverLink,
}: {
  state: GameState;
  onBuy?: (linkId: LinkId) => void;
  /** Whether the local viewer may act right now (it's their turn). */
  canBuy: boolean;
  /** The card currently called out as about to be removed as unplayable — see useLoveTrianglesActions's pendingRemoval. */
  doomedLinkId?: LinkId | null;
  /** Fired on hover/unhover of any card, buyable or not — lets the map show the hypothetical line. */
  onHoverLink?: (linkId: LinkId | null) => void;
}) {
  const activeSeat = state.activeSeat;
  const activeGems = state.players[activeSeat].gems;

  function renderSlot(id: LinkId | null, buyable: boolean, key: string) {
    if (!id) {
      return (
        <div key={key} className="panel" style={{ flex: 1, padding: 10, opacity: 0.35, textAlign: 'center' }}>
          —
        </div>
      );
    }
    const link = LINKS[id];
    const cost = effectiveCost(state, id, activeSeat);
    const affordable = activeGems >= cost.total;
    const clickable = buyable && canBuy && affordable;
    const isDoomed = id === doomedLinkId;
    return (
      // Deliberately not a native `disabled` button: disabled form controls
      // suppress hover events in most browsers, which was silently killing
      // the map preview line for every card except the one currently
      // buyable. Click is gated in the handler instead, and disabled-ness
      // is communicated purely visually.
      <button
        key={key}
        onClick={() => {
          if (clickable && !isDoomed) onBuy?.(id);
        }}
        onMouseEnter={() => onHoverLink?.(id)}
        onMouseMove={() => onHoverLink?.(id)}
        onMouseLeave={() => onHoverLink?.(null)}
        style={{
          flex: 1,
          fontFamily: 'inherit',
          fontSize: 15,
          background: 'var(--panel-bg)',
          color: 'var(--text)',
          borderRadius: 8,
          padding: 10,
          textAlign: 'center',
          cursor: clickable && !isDoomed ? 'pointer' : 'default',
          border: isDoomed ? '2px solid crimson' : buyable && affordable ? '2px solid var(--accent)' : '1px solid var(--border)',
          opacity: isDoomed ? 0.6 : 1,
        }}
      >
        <div style={{ fontWeight: 'bold' }}>
          {link.a}–{link.b}
        </div>
        <div style={{ fontSize: 13 }}>
          {isDoomed ? (
            <span style={{ color: 'crimson' }}>crossed!</span>
          ) : (
            costSegments(state, id, activeSeat).map((s, i) => (
              <span key={i} style={{ color: s.color, opacity: i === 0 ? 1 : 0.7 }}>
                {i > 0 ? '+' : ''}
                {s.amount}
              </span>
            ))
          )}
        </div>
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {state.topRow.map((id, i) => renderSlot(id, true, `top-${i}`))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {state.bottomRow.map((id, i) => renderSlot(id, false, `bottom-${i}`))}
      </div>
    </div>
  );
}
