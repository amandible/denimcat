import type { DetourStateView, SeatId } from '@denimcat/engine-detour';

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
          <p key={seat} style={{ margin: '4px 0', fontWeight: isWinner ? 'bold' : 'normal' }}>
            {displayLabel(seat)}: {gameState.players[seat].score}
          </p>
        );
      })}
    </div>
  );
}
