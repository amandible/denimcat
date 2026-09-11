import type { GameState, LinkId } from '@denimcat/engine-love-triangles';
import { effectiveCost, LINKS } from '@denimcat/engine-love-triangles';

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
}: {
  state: GameState;
  onBuy?: (linkId: LinkId) => void;
  /** Whether the local viewer may act right now (it's their turn). */
  canBuy: boolean;
  /** The card currently called out as about to be removed as unplayable — see useLoveTrianglesActions's pendingRemoval. */
  doomedLinkId?: LinkId | null;
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
      <button
        key={key}
        className="btn"
        disabled={!clickable || isDoomed}
        onClick={() => onBuy?.(id)}
        style={{
          flex: 1,
          padding: 10,
          textAlign: 'center',
          border: isDoomed ? '2px solid crimson' : buyable && affordable ? '2px solid var(--accent)' : undefined,
          opacity: isDoomed ? 0.6 : 1,
        }}
      >
        <div style={{ fontWeight: 'bold' }}>
          {link.a}–{link.b}
        </div>
        <div style={{ fontSize: 13, color: isDoomed ? 'crimson' : 'var(--muted)' }}>
          {isDoomed ? 'crossed!' : cost.total}
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
