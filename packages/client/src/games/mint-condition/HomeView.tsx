import { useState, type FormEvent } from 'react';
import type { PlayerCount } from '@denimcat/engine-mint-condition';
import { createSocket } from '../../socket';
import '../../styles/mint-condition.css';

function goToRoom(code: string) {
  window.location.href = `/mint-condition/room/${code.toUpperCase()}`;
}

export function MintConditionHomeView() {
  const [codeInput, setCodeInput] = useState('');
  const [playerCount, setPlayerCount] = useState<PlayerCount>(2);
  const [busy, setBusy] = useState(false);

  function handleCreate() {
    setBusy(true);
    const socket = createSocket('/mint-condition');
    socket.on('connect', () => {
      socket.emit(
        'create_room',
        { playerCount },
        (result: { ok: true; roomCode: string } | { ok: false; error: unknown }) => {
          socket.close();
          if (result.ok) goToRoom(result.roomCode);
        },
      );
    });
  }

  function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (codeInput.trim()) goToRoom(codeInput.trim());
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
      <div className="panel" style={{ width: '100%' }}>
        <h1 style={{ fontSize: 28 }}>Mint Condition</h1>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>TODO: Mint Condition description</p>

        <p style={{ fontSize: 14, marginBottom: 6 }}>Players</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([2, 3, 4] as PlayerCount[]).map((count) => (
            <button
              key={count}
              className="btn"
              onClick={() => setPlayerCount(count)}
              style={count === playerCount ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px rgba(43,138,62,0.2)' } : undefined}
            >
              {count}
            </button>
          ))}
        </div>

        <button className="btn btn-primary" onClick={handleCreate} disabled={busy} style={{ width: '100%', padding: 12, fontSize: 16 }}>
          Create a room
        </button>
        <div style={{ margin: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>or</div>
        <form onSubmit={handleJoin} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Room code"
            maxLength={4}
            style={{
              flex: 1,
              padding: 12,
              fontSize: 16,
              textTransform: 'uppercase',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          />
          <button className="btn" type="submit" style={{ padding: '12px 16px', fontSize: 16 }}>
            Join
          </button>
        </form>
      </div>
    </main>
  );
}
