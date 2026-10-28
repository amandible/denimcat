import { useEffect, useState } from 'react';
import type { LinkId, SeatId } from '@denimcat/engine-love-triangles';
import { LINKS, computeScoreBreakdowns } from '@denimcat/engine-love-triangles';
import type { LoveTrianglesConnection } from './useLoveTrianglesActions';
import { MapBoard } from './components/MapBoard';
import { DisplayTrack } from './components/DisplayTrack';
import { DiscardList } from './components/DiscardList';
import { RulesContent } from './components/RulesContent';
import { RulesModal } from '../../components/RulesModal';
import { ActivityPanel } from '../../components/ActivityPanel';
import { RecapPanel } from '../../components/RecapPanel';
import { playerLabel, substituteSeatTokens } from '../../playerLabel';
import { seatLabel } from './seats';

export function GameView({ roomCode, connection }: { roomCode: string; connection: LoveTrianglesConnection }) {
  const { gameState, you, pendingRemoval, animating } = connection;
  const [hoveredLinkId, setHoveredLinkId] = useState<LinkId | null>(null);
  const [showRules, setShowRules] = useState(false);

  // A display slot can be refilled with a different card while the mouse
  // never leaves that slot's button (no mouseenter/mouseleave fires from a
  // content change alone) — without this, the preview line would keep
  // showing the *previous* card that used to be there. Clearing on every
  // state change means the stale line simply disappears until the mouse
  // actually moves again (DisplayTrack's onMouseMove then picks up
  // whatever's really under the pointer).
  useEffect(() => {
    setHoveredLinkId(null);
  }, [gameState]);

  if (!gameState || !you) return null;

  const mySeat = you.role !== 'spectator' ? (you.role as SeatId) : null;
  const isMyTurn = !!mySeat && gameState.phase === 'playing' && gameState.activeSeat === mySeat && !animating;
  // Combines a seat's position label with its player-supplied name (see
  // playerLabel's doc comment) — used anywhere a seat's identity is shown
  // to a viewer, so a name set in Settings actually shows up instead of
  // always reading "Player 1".
  const displayLabel = (seat: SeatId): string => playerLabel(connection.roomInfo?.seats[seat]?.name, seatLabel(seat));
  const displayLog = gameState.log.map((line) => substituteSeatTokens(line, gameState.seats, (seat) => displayLabel(seat as SeatId)));

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', display: 'flex', gap: 28, flexWrap: 'wrap' }}>
      <div style={{ flex: '2 1 420px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Room {roomCode}</h2>
          <button className="btn" onClick={() => setShowRules(true)}>
            Rules
          </button>
        </div>
        <MapBoard
          state={gameState}
          crossingLinkIds={pendingRemoval?.crossedLinks ?? []}
          previewLinkId={hoveredLinkId}
          mySeat={mySeat}
        />
        <div style={{ width: '100%' }}>
          <DisplayTrack
            state={gameState}
            canBuy={isMyTurn}
            doomedLinkId={pendingRemoval?.linkId ?? null}
            onBuy={(linkId) => connection.buyLink(linkId)}
            onHoverLink={setHoveredLinkId}
          />
        </div>
      </div>

      <div className="panel" style={{ flex: '1 1 260px', height: 'fit-content' }}>
        <p style={{ marginTop: 0 }}>
          You are <strong>{you.role === 'spectator' ? 'a spectator' : seatLabel(mySeat as SeatId)}</strong>
          {mySeat && gameState.phase === 'playing' && (
            <> — {isMyTurn ? "it's your turn" : `waiting on ${displayLabel(gameState.activeSeat)}`}</>
          )}
        </p>

        <h3>Gems</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {gameState.seats.map((seat) => (
            <li key={seat} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{displayLabel(seat)}</span>
              <strong>{gameState.players[seat].gems}</strong>
            </li>
          ))}
        </ul>

        <DiscardList state={gameState} />

        {mySeat && isMyTurn && (
          <div style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => connection.pass()} style={{ width: '100%', padding: 10 }}>
              Pass (+4 gems)
            </button>
          </div>
        )}

        {gameState.phase === 'ended' && gameState.winner && (
          <div style={{ marginTop: 16 }}>
            <RecapPanel
              gameId="love-triangles"
              roomCode={roomCode}
              mySeat={mySeat}
              myPositionLabel={mySeat ? seatLabel(mySeat) : undefined}
              resultSummary={
                <>
                  <p style={{ margin: 0 }}>
                    {gameState.winner.length > 1 ? 'Shared victory: ' : 'Winner: '}
                    {gameState.winner.map(displayLabel).join(', ')}
                  </p>
                  {(() => {
                    const breakdowns = computeScoreBreakdowns(gameState);
                    const bySeat = [...gameState.seats].sort((a, b) => breakdowns[b].total - breakdowns[a].total);
                    return (
                      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                        {bySeat.map((seat) => {
                          const { loopSize, reachable, total } = breakdowns[seat];
                          const isWinner = gameState.winner!.includes(seat);
                          return (
                            <li key={seat} style={{ padding: '4px 0', fontWeight: isWinner ? 'bold' : 'normal' }}>
                              {displayLabel(seat)}: {total} pts
                              <span style={{ color: 'var(--muted)', fontWeight: 'normal' }}>
                                {' '}
                                ({loopSize}-node loop{reachable > 0 ? ` + ${reachable} reachable` : ''})
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    );
                  })()}
                </>
              }
            />
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <ActivityPanel
            log={displayLog}
            chatMessages={connection.roomInfo?.chatMessages ?? []}
            onSend={(text) => connection.sendAction('send_chat', { text, afterLogIndex: gameState.log.length })}
            seatLabel={seatLabel as (seat: string) => string}
          />
        </div>

        {connection.lastError && <p style={{ color: 'crimson' }}>{connection.lastError}</p>}
      </div>

      {showRules && (
        <RulesModal onClose={() => setShowRules(false)}>
          <RulesContent />
        </RulesModal>
      )}
    </main>
  );
}
