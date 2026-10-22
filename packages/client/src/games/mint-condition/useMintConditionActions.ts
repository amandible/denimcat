import { useCallback } from 'react';
import type { AuctionReward, MintConditionStateView } from '@denimcat/engine-mint-condition';
import { useRoomConnection } from '../../state/useRoomConnection';

export function useMintConditionActions(roomCode: string, options?: { role?: string }) {
  const connection = useRoomConnection<MintConditionStateView>('mint-condition', '/mint-condition', roomCode, options);

  const placeBid = useCallback((cards: number[]) => connection.sendAction('place_bid', { cards }), [connection]);
  const pass = useCallback(() => connection.sendAction('pass'), [connection]);
  const takePrize = useCallback((prizeId: string) => connection.sendAction('take_prize', { prizeId }), [connection]);
  const chooseAuctionReward = useCallback(
    (reward: AuctionReward) => connection.sendAction('choose_auction_reward', { reward }),
    [connection],
  );
  const placeNewPrize = useCallback(
    (slotIndex: number) => connection.sendAction('place_new_prize', { slotIndex }),
    [connection],
  );

  return { ...connection, placeBid, pass, takePrize, chooseAuctionReward, placeNewPrize };
}

export type MintConditionConnection = ReturnType<typeof useMintConditionActions>;
