import { useEffect, useState } from 'react';

/**
 * Auto-shown (not click-to-open, unlike RulesModal) the first time a
 * viewer sees a non-empty `whatsNew` for a given room, so a repeat
 * playtester is told about a rule change before they start playing
 * rather than assuming the old rules still apply. See
 * docs/guides/game-rule-versions.md.
 *
 * Dismissal is remembered per (roomCode, message) in localStorage —
 * keyed by the message text too, not just roomCode, because room codes
 * get recycled (see PersistedRoom.roomId's doc comment) and a brand-new
 * room could reuse an old code; keying on the text as well means a
 * genuinely different "what's new" message for a new room always shows,
 * even if the code happens to repeat.
 */
export function WhatsNewNotice({ roomCode, whatsNew }: { roomCode: string; whatsNew: string | undefined }) {
  const key = whatsNew ? `whats-new-seen:${roomCode}:${whatsNew.length}:${whatsNew.slice(0, 40)}` : null;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return key ? localStorage.getItem(key) === '1' : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      setDismissed(key ? localStorage.getItem(key) === '1' : true);
    } catch {
      setDismissed(true);
    }
  }, [key]);

  if (!whatsNew || dismissed || !key) return null;

  function dismiss() {
    try {
      if (key) localStorage.setItem(key, '1');
    } catch {
      // Private window / storage disabled — fine to just not remember this dismissal.
    }
    setDismissed(true);
  }

  return (
    <div
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
      <div className="panel" style={{ maxWidth: 480, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>What's new in this game</h3>
        <p style={{ fontSize: 13, lineHeight: 1.5 }}>{whatsNew}</p>
        <button className="btn btn-primary" onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
