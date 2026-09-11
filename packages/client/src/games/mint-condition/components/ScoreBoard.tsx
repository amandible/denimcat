import { scoreForPrizes, type MintConditionStateView } from '@denimcat/engine-mint-condition';
import { seatLabel } from '../seats';
import { PrizeChip } from './PrizeChip';

export function ScoreBoard({ state }: { state: MintConditionStateView }) {
  const ended = state.phase === 'ended';

  return (
    <div>
      <h3>Score</h3>
      {state.seats.map((seat) => {
        const wonPrizes = state.players[seat].wonPrizes;
        const { base, colorBonus, total } = scoreForPrizes(wonPrizes);
        const isWinner = ended && state.winner?.includes(seat);
        return (
          <div key={seat} style={{ margin: '10px 0' }}>
            <p
              style={{
                margin: '0 0 6px',
                color: 'var(--text)',
                fontSize: ended ? 20 : 14,
                fontWeight: isWinner ? 'bold' : 500,
              }}
            >
              {seatLabel(seat)}: {total}{' '}
              {colorBonus > 0 && (
                <span style={{ color: 'var(--muted)', fontWeight: 'normal' }}>
                  ({base} + {colorBonus} color bonus)
                </span>
              )}
            </p>
            {wonPrizes.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {wonPrizes.map((p) => (
                  <PrizeChip key={p.id} prize={p} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {ended && (
        <p style={{ fontWeight: 'bold', fontSize: 24, marginTop: 12 }}>
          {state.winner && state.winner.length > 1
            ? `Shared win: ${state.winner.map(seatLabel).join(' & ')}!`
            : `${state.winner ? seatLabel(state.winner[0]) : ''} wins!`}
        </p>
      )}

      {state.discardPile.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 6 }}>Discarded</h3>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--muted)' }}>Priced too high and removed from the game.</p>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {state.discardPile.map((p) => (
              <PrizeChip key={p.id} prize={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
