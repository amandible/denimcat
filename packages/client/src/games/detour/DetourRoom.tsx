import type { DetourStateView, PlayerCount } from '@denimcat/engine-detour';
import { HotseatRoom } from '../../views/HotseatRoom';
import { LobbyView } from '../../views/LobbyView';
import { useDocumentTitle } from '../../state/useDocumentTitle';
import { useTurnChime } from '../../state/useTurnChime';
import { useDetourActions } from './useDetourActions';
import { GameView } from './GameView';
import { CANDIDATE_SEATS, seatLabel } from './seats';

function isPlayerCount(value: number): value is PlayerCount {
  return value === 2 || value === 3 || value === 4;
}

function getTurnSeat(gameState: DetourStateView) {
  return gameState.phase === 'ended' ? null : gameState.activeSeat;
}

export function DetourRoom({ roomCode }: { roomCode: string }) {
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
        useActions={useDetourActions}
        candidateSeats={CANDIDATE_SEATS.slice(0, playerCount)}
        seatLabel={seatLabel as (seat: string) => string}
        GameView={GameView}
        getTurnSeat={getTurnSeat}
      />
    );
  }

  return <NormalDetourRoom roomCode={roomCode} />;
}

function NormalDetourRoom({ roomCode }: { roomCode: string }) {
  const connection = useDetourActions(roomCode);
  useDocumentTitle('Detour', connection, getTurnSeat);
  useTurnChime(connection, getTurnSeat);

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
