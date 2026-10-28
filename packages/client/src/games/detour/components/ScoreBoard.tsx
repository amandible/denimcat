import type { DetourStateView, SeatId } from '@denimcat/engine-detour';
import { OWNER_COLORS } from './Board';

export function ScoreBoard({
  gameState,
  displayLabel,
}: {
  gameState: DetourStateView;
  displayLabel: (seat: SeatId) => string;
}) {
  const ended = gameState.phase === 'ended';
  return (
    <div>
      <h3>Score</h3>
      {gameState.seats.map((seat) => {
        const isWinner = ended && gameState.winner?.includes(seat);
        return (
          <p key={seat} style={{ margin: '4px 0', fontWeight: isWinner ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: OWNER_COLORS[seat],
                flexShrink: 0,
              }}
            />
            {displayLabel(seat)} <span style={{ color: 'var(--muted)', fontWeight: 'normal' }}>(Deck {gameState.players[seat].deckId})</span>:{' '}
            {gameState.players[seat].score}
          </p>
        );
      })}
    </div>
  );
}
