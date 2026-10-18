import type { PlayerCount } from '@denimcat/engine-love-triangles';
import { HotseatRoom } from '../../views/HotseatRoom';
import { LobbyView } from '../../views/LobbyView';
import { useLoveTrianglesActions } from './useLoveTrianglesActions';
import { GameView } from './GameView';
import { CANDIDATE_SEATS, seatLabel } from './seats';
import '../../styles/love-triangles.css';

function isPlayerCount(value: number): value is PlayerCount {
  return value === 2 || value === 3 || value === 4;
}

export function LoveTrianglesRoom({ roomCode }: { roomCode: string }) {
  const params = new URLSearchParams(window.location.search);
  const isHotseat = params.get('hotseat') !== null;

  if (isHotseat) {
    // A hotseat room has no other way to learn its own seat count before the
    // first join attempt — HotseatRoom joins every candidate seat right
    // away, and joining one that doesn't exist for this room fails hard
    // (see HomeView's goToRoom, which is the only place this param is set).
    const requestedPlayers = Number(params.get('players'));
    const playerCount = isPlayerCount(requestedPlayers) ? requestedPlayers : 2;
    return (
      <HotseatRoom
        roomCode={roomCode}
        useActions={useLoveTrianglesActions}
        candidateSeats={CANDIDATE_SEATS.slice(0, playerCount)}
        seatLabel={seatLabel as (seat: string) => string}
        GameView={GameView}
        getTurnSeat={(gameState) => (gameState.phase === 'ended' ? null : gameState.activeSeat)}
      />
    );
  }

  return <NormalLoveTrianglesRoom roomCode={roomCode} />;
}

function NormalLoveTrianglesRoom({ roomCode }: { roomCode: string }) {
  const connection = useLoveTrianglesActions(roomCode);

  if (connection.status === 'connecting') {
    return <Centered>Connecting…</Centered>;
  }
  if (connection.status === 'picking-role' || !connection.you) {
    return (
      <LobbyView
        roomCode={roomCode}
        connection={connection}
        candidateSeats={CANDIDATE_SEATS}
        seatLabel={seatLabel as (seat: string) => string}
      />
    );
  }
  return <GameView roomCode={roomCode} connection={connection} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ textAlign: 'center', marginTop: 100, color: 'var(--muted)', fontSize: 16 }}>{children}</div>;
}
