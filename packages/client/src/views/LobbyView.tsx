import { useEffect, useState } from 'react';
import type { RoomConnection } from '../state/useRoomConnection';
import { loadAuthEmail, loadDisplayName } from '../state/authToken';

export function LobbyView({
  roomCode,
  connection,
  candidateSeats,
  seatLabel,
}: {
  roomCode: string;
  connection: RoomConnection<unknown>;
  /** Fallback used only until the room's actual seat list has loaded (see peek_room). */
  candidateSeats: string[];
  seatLabel: (seat: string) => string;
}) {
  const seats = connection.roomInfo?.seatOrder ?? candidateSeats;
  // Every visitor is signed in with an email by now (the site-wide magic-link
  // gate), so there's nothing left to type here — just whether they want
  // notifications, not which address to send them to. See Settings for
  // changing the display name this pre-fills from.
  const authEmail = loadAuthEmail();
  const [notifyByEmail, setNotifyByEmail] = useState(false);
  const [name, setName] = useState(loadDisplayName() ?? '');
  // A stored seat token for this room went stale (its reconnect grace
  // lapsed since this browser was last here) — unless someone else has
  // since claimed that seat, this player isn't picking a fresh one, they're
  // coming back to their own. See RoomConnection.previousRole's doc comment.
  // Checked against `claimed`, not mere presence: if this account still
  // genuinely owned that seat, reconnect_by_account (tried before ever
  // reaching this screen) would already have reclaimed it — reaching here
  // with a previousRole whose seat shows claimed means someone ELSE has it.
  const returningSeat =
    connection.previousRole && !connection.roomInfo?.seats[connection.previousRole]?.claimed ? connection.previousRole : null;

  // Offer back whatever name this browser typed in last time it joined that
  // seat, if any — see StoredSeat.name's doc comment. Still freely editable;
  // this is just a convenience so a returning player isn't asked to
  // re-introduce themselves to a room they're already in.
  useEffect(() => {
    if (connection.previousName) setName(connection.previousName);
  }, [connection.previousName]);

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
      <div className="panel" style={{ width: '100%' }}>
        <h1>Room {roomCode}</h1>
        <p style={{ color: 'var(--muted)' }}>Share this code with others to play together, or join as a spectator.</p>
        {returningSeat && (
          <p style={{ color: 'var(--accent)', fontWeight: 600, marginTop: -4 }}>
            Welcome back{connection.previousName ? `, ${connection.previousName}` : ''}! Continue below as {seatLabel(returningSeat)}.
          </p>
        )}
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Your name (optional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alex"
            maxLength={40}
            style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid var(--border)', borderRadius: 8 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 16 }}>
          <input type="checkbox" checked={notifyByEmail} onChange={(e) => setNotifyByEmail(e.target.checked)} />
          {authEmail ? `Email me at ${authEmail} when it's my turn` : "Email me when it's my turn"}
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
          {seats.map((seat) => {
            const occupant = connection.roomInfo?.seats[seat];
            const isReturning = seat === returningSeat;
            return (
              <button
                key={seat}
                className={isReturning ? 'btn btn-primary' : 'btn'}
                disabled={!!occupant}
                onClick={() =>
                  connection.joinAs(seat, notifyByEmail ? (authEmail ?? undefined) : undefined, name.trim() || undefined)
                }
                style={{ padding: 12, fontSize: 16 }}
              >
                {occupant
                  ? `${seatLabel(seat)} — taken${occupant.name ? ` by ${occupant.name}` : ''}${occupant.claimed && !occupant.connected ? ' (away)' : ''}`
                  : isReturning
                    ? `Continue as ${seatLabel(seat)}`
                    : `Join as ${seatLabel(seat)}`}
              </button>
            );
          })}
          <button className="btn" onClick={() => connection.joinAs('spectator')} style={{ padding: 12, fontSize: 16 }}>
            Spectate
          </button>
        </div>
        {connection.lastError && <p style={{ color: 'crimson' }}>{connection.lastError}</p>}
      </div>
    </main>
  );
}
