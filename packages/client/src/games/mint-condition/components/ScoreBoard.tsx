import { scoreForPrizes, type MintConditionStateView } from '@denimcat/engine-mint-condition';
import { seatLabel } from '../seats';

export function ScoreBoard({ state }: { state: MintConditionStateView }) {
  const ended = state.phase === 'ended';

  return (
    <div>
      <h3>Score</h3>
      {state.seats.map((seat) => {
        const { base, colorBonus, total } = scoreForPrizes(state.players[seat].wonPrizes);
        const isWinner = ended && state.winner?.includes(seat);
        return (
          <p
            key={seat}
            style={{
              margin: '4px 0',
              color: 'var(--text)',
              fontSize: ended ? 20 : 14,
              fontWeight: isWinner ? 'bold' : 500,
            }}
          >
            {seatLabel(seat)}: {total} {colorBonus > 0 && <span style={{ color: 'var(--muted)', fontWeight: 'normal' }}>({base} + {colorBonus} color bonus)</span>}
          </p>
        );
      })}
      {ended && (
        <p style={{ fontWeight: 'bold', fontSize: 24, marginTop: 12 }}>
          {state.winner && state.winner.length > 1
            ? `Shared win: ${state.winner.map(seatLabel).join(' & ')}!`
            : `${state.winner ? seatLabel(state.winner[0]) : ''} wins!`}
        </p>
      )}
    </div>
  );
}
