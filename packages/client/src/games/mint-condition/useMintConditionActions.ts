import { useCallback } from 'react';
import type { MintConditionStateView } from '@denimcat/engine-mint-condition';
import { useRoomConnection } from '../../state/useRoomConnection';

export function useMintConditionActions(roomCode: string) {
  const connection = useRoomConnection<MintConditionStateView>('mint-condition', '/mint-condition', roomCode);

  const placeBid = useCallback((cards: number[]) => connection.sendAction('place_bid', { cards }), [connection]);
  const pass = useCallback(() => connection.sendAction('pass'), [connection]);
  const takePrize = useCallback((prizeId: string) => connection.sendAction('take_prize', { prizeId }), [connection]);
  const skipPrizeChoice = useCallback(() => connection.sendAction('skip_prize_choice'), [connection]);
  const placeNewPrize = useCallback(
    (slotIndex: number) => connection.sendAction('place_new_prize', { slotIndex }),
    [connection],
  );

  return { ...connection, placeBid, pass, takePrize, skipPrizeChoice, placeNewPrize };
}

export type MintConditionConnection = ReturnType<typeof useMintConditionActions>;
