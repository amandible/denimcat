import type { SeatId } from '@denimcat/engine-love-triangles';
import type { LoveTrianglesConnection } from './useLoveTrianglesActions';
import { MapBoard } from './components/MapBoard';
import { DisplayTrack } from './components/DisplayTrack';
import { seatLabel } from './seats';

export function GameView({ roomCode, connection }: { roomCode: string; connection: LoveTrianglesConnection }) {
  const { gameState, you, pendingRemoval, animating } = connection;
  if (!gameState || !you) return null;

  const mySeat = you.role !== 'spectator' ? (you.role as SeatId) : null;
  const isMyTurn = !!mySeat && gameState.phase === 'playing' && gameState.activeSeat === mySeat && !animating;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', display: 'flex', gap: 28, flexWrap: 'wrap' }}>
      <div style={{ flex: '2 1 420px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <h2 style={{ alignSelf: 'flex-start', marginBottom: 0 }}>Room {roomCode}</h2>
        <MapBoard state={gameState} crossingLinkIds={pendingRemoval?.crossedLinks ?? []} />
        <div style={{ width: '100%' }}>
          <DisplayTrack
            state={gameState}
            canBuy={isMyTurn}
            doomedLinkId={pendingRemoval?.linkId ?? null}
            onBuy={(linkId) => connection.buyLink(linkId)}
          />
        </div>
      </div>

      <div className="panel" style={{ flex: '1 1 260px', height: 'fit-content' }}>
        <p style={{ marginTop: 0 }}>
          You are <strong>{you.role === 'spectator' ? 'a spectator' : seatLabel(mySeat as SeatId)}</strong>
          {mySeat && gameState.phase === 'playing' && (
            <> — {isMyTurn ? "it's your turn" : `waiting on ${seatLabel(gameState.activeSeat)}`}</>
          )}
        </p>

        <h3>Gems</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {gameState.seats.map((seat) => (
            <li key={seat} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{seatLabel(seat)}</span>
              <strong>{gameState.players[seat].gems}</strong>
            </li>
          ))}
        </ul>

        {mySeat && isMyTurn && (
          <div style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => connection.pass()} style={{ width: '100%', padding: 10 }}>
              Pass (+2 gems)
            </button>
          </div>
        )}

        {gameState.phase === 'ended' && gameState.winner && (
          <div className="panel" style={{ marginTop: 16, background: 'var(--bg)' }}>
            <h3 style={{ marginTop: 0 }}>Game over</h3>
            <p>
              {gameState.winner.length > 1 ? 'Shared victory: ' : 'Winner: '}
              {gameState.winner.map(seatLabel).join(', ')}
            </p>
          </div>
        )}

        {connection.lastError && <p style={{ color: 'crimson' }}>{connection.lastError}</p>}
      </div>
    </main>
  );
}
