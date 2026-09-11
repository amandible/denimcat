import { LobbyView } from '../../views/LobbyView';
import { useLoveTrianglesActions } from './useLoveTrianglesActions';
import { GameView } from './GameView';
import { CANDIDATE_SEATS, seatLabel } from './seats';
import '../../styles/love-triangles.css';

export function LoveTrianglesRoom({ roomCode }: { roomCode: string }) {
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
