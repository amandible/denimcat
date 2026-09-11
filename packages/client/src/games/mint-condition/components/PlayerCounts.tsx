import type { MintConditionStateView } from '@denimcat/engine-mint-condition';
import { seatLabel } from '../seats';

/** Low-key hand/deck size readout per seat — public info (deckSize/handSize are already in the wire view for every seat), just never surfaced anywhere before. */
export function PlayerCounts({ state }: { state: MintConditionStateView }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '8px 0' }}>
      {state.seats.map((seat) => {
        const player = state.players[seat];
        return (
          <p key={seat} style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
            {seatLabel(seat)}: {player.handSize} card{player.handSize === 1 ? '' : 's'} in hand, {player.deckSize} in deck
          </p>
        );
      })}
    </div>
  );
}
