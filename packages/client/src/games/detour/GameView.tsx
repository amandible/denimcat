import { useState } from 'react';
import type { SeatId } from '@denimcat/engine-detour';
import type { DetourConnection } from './useDetourActions';
import { Board } from './components/Board';
import { ScoreBoard } from './components/ScoreBoard';
import { RulesContent } from './components/RulesContent';
import { RulesModal } from '../../components/RulesModal';
import { ActivityPanel } from '../../components/ActivityPanel';
import { RecapPanel } from '../../components/RecapPanel';
import { playerLabel, substituteSeatTokens } from '../../playerLabel';
import { seatLabel } from './seats';

export function GameView({ roomCode, connection }: { roomCode: string; connection: DetourConnection }) {
  const { gameState, you } = connection;
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);

  if (!gameState || !you) return null;

  const mySeat = you.role !== 'spectator' ? (you.role as SeatId) : null;
  const isMyTurn = !!mySeat && gameState.phase === 'playing' && gameState.activeSeat === mySeat;
  const myHand = mySeat ? (gameState.players[mySeat].hand ?? []) : [];

  // Combines a seat's position label with its player-supplied name (see
  // playerLabel's doc comment) — used anywhere a seat's identity is shown
  // to a viewer, so a name set in Settings actually shows up instead of
  // always reading "Player 1".
  const displayLabel = (seat: SeatId): string => playerLabel(connection.roomInfo?.seats[seat]?.name, seatLabel(seat));
  const displayLog = gameState.log.map((line) => substituteSeatTokens(line, gameState.seats, (seat) => displayLabel(seat as SeatId)));

  function handleCellClick(cellId: string) {
    if (!isMyTurn || selectedCard === null) return;
    connection.playCard(selectedCard, cellId);
    setSelectedCard(null);
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', display: 'flex', gap: 28, flexWrap: 'wrap' }}>
      <div style={{ flex: '2 1 420px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Room {roomCode}</h2>
          <button className="btn" onClick={() => setShowRules(true)}>
            Rules
          </button>
        </div>
        <Board
          cells={gameState.cells}
          pawnCell={gameState.pawnCell}
          canPlay={isMyTurn && selectedCard !== null}
          onCellClick={handleCellClick}
        />
        {mySeat && gameState.phase === 'playing' && (
          <div style={{ alignSelf: 'stretch' }}>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 6 }}>
              {isMyTurn
                ? selectedCard === null
                  ? 'Select a card from your hand, then click a cell to play it.'
                  : `Playing ${selectedCard} — click a cell.`
                : `Waiting on ${displayLabel(gameState.activeSeat)}.`}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {myHand.map((value) => (
                <button
                  key={value}
                  className="btn"
                  disabled={!isMyTurn}
                  onClick={() => setSelectedCard(value === selectedCard ? null : value)}
                  style={
                    value === selectedCard
                      ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px rgba(43,138,62,0.2)' }
                      : undefined
                  }
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel" style={{ flex: '1 1 260px', height: 'fit-content' }}>
        <p style={{ marginTop: 0 }}>
          You are <strong>{you.role === 'spectator' ? 'a spectator' : seatLabel(mySeat as SeatId)}</strong>
        </p>

        <ScoreBoard gameState={gameState} displayLabel={displayLabel} />

        {gameState.phase === 'ended' && gameState.winner && (
          <div style={{ marginTop: 16 }}>
            <RecapPanel
              gameId="detour"
              roomCode={roomCode}
              mySeat={mySeat}
              myPositionLabel={mySeat ? seatLabel(mySeat) : undefined}
              resultSummary={
                <>
                  <p style={{ margin: 0 }}>
                    {gameState.winner.length > 1 ? 'Shared victory: ' : 'Winner: '}
                    {gameState.winner.map(displayLabel).join(', ')}
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                    {[...gameState.seats]
                      .sort((a, b) => gameState.players[b].score - gameState.players[a].score)
                      .map((seat) => {
                        const isWinner = gameState.winner!.includes(seat);
                        return (
                          <li key={seat} style={{ padding: '4px 0', fontWeight: isWinner ? 'bold' : 'normal' }}>
                            {displayLabel(seat)}: {gameState.players[seat].score} pts
                          </li>
                        );
                      })}
                  </ul>
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
