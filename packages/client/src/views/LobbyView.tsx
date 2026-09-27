import { useState } from 'react';
import type { RoomConnection } from '../state/useRoomConnection';

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
  const [email, setEmail] = useState('');

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
      <div className="panel" style={{ width: '100%' }}>
        <h1>Room {roomCode}</h1>
        <p style={{ color: 'var(--muted)' }}>Share this code with others to play together, or join as a spectator.</p>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
            Email (optional) — get notified when it's your turn
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid var(--border)', borderRadius: 8 }}
          />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {seats.map((seat) => (
            <button key={seat} className="btn" onClick={() => connection.joinAs(seat, email.trim() || undefined)} style={{ padding: 12, fontSize: 16 }}>
              Join as {seatLabel(seat)}
            </button>
          ))}
          <button className="btn" onClick={() => connection.joinAs('spectator')} style={{ padding: 12, fontSize: 16 }}>
            Spectate
          </button>
        </div>
        {connection.lastError && <p style={{ color: 'crimson' }}>{connection.lastError}</p>}
      </div>
    </main>
  );
}
