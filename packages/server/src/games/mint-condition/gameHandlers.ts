import type { Socket } from 'socket.io';
import {
  chooseAuctionReward,
  pass,
  placeBid,
  placeNewPrize,
  takePrize,
  type GameState,
  type MintConditionConfig,
  type SeatId,
} from '@denimcat/engine-mint-condition';
import { isNonEmptyString, type RoomStore } from '@denimcat/platform';
import { isAuctionReward, isCardArray, isSlotIndex } from './validate';

type MintConditionStore = RoomStore<GameState, MintConditionConfig, SeatId>;

const INVALID_PAYLOAD = { code: 'INVALID_PAYLOAD', message: 'Malformed request.' };
const INTERNAL_ERROR = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };

export function registerMintConditionHandlers(socket: Socket, store: MintConditionStore): void {
  socket.on('place_bid', (payload: { roomCode?: unknown; cards?: unknown }, cb: (res: unknown) => void) => {
    if (!payload || !isNonEmptyString(payload.roomCode) || !isCardArray(payload.cards)) {
      cb({ ok: false, error: INVALID_PAYLOAD });
      return;
    }
    const { roomCode, cards } = payload;
    store
      .applyAction(roomCode, socket.id, (state, seat) => placeBid(state, seat, cards))
      .then(cb)
      .catch((error) => {
        console.error('[socket:mint-condition] place_bid failed:', error);
        cb({ ok: false, error: INTERNAL_ERROR });
      });
  });

  socket.on('pass', (payload: { roomCode?: unknown }, cb: (res: unknown) => void) => {
    if (!payload || !isNonEmptyString(payload.roomCode)) {
      cb({ ok: false, error: INVALID_PAYLOAD });
      return;
    }
    const { roomCode } = payload;
    store
      .applyAction(roomCode, socket.id, (state, seat) => pass(state, seat))
      .then(cb)
      .catch((error) => {
        console.error('[socket:mint-condition] pass failed:', error);
        cb({ ok: false, error: INTERNAL_ERROR });
      });
  });

  socket.on('take_prize', (payload: { roomCode?: unknown; prizeId?: unknown }, cb: (res: unknown) => void) => {
    if (!payload || !isNonEmptyString(payload.roomCode) || !isNonEmptyString(payload.prizeId)) {
      cb({ ok: false, error: INVALID_PAYLOAD });
      return;
    }
    const { roomCode, prizeId } = payload;
    store
      .applyAction(roomCode, socket.id, (state, seat) => takePrize(state, seat, prizeId))
      .then(cb)
      .catch((error) => {
        console.error('[socket:mint-condition] take_prize failed:', error);
        cb({ ok: false, error: INTERNAL_ERROR });
      });
  });

  socket.on(
    'choose_auction_reward',
    (payload: { roomCode?: unknown; reward?: unknown }, cb: (res: unknown) => void) => {
      if (!payload || !isNonEmptyString(payload.roomCode) || !isAuctionReward(payload.reward)) {
        cb({ ok: false, error: INVALID_PAYLOAD });
        return;
      }
      const { roomCode, reward } = payload;
      store
        .applyAction(roomCode, socket.id, (state, seat) => chooseAuctionReward(state, seat, reward))
        .then(cb)
        .catch((error) => {
          console.error('[socket:mint-condition] choose_auction_reward failed:', error);
          cb({ ok: false, error: INTERNAL_ERROR });
        });
    },
  );

  socket.on(
    'place_new_prize',
    (payload: { roomCode?: unknown; slotIndex?: unknown }, cb: (res: unknown) => void) => {
      if (!payload || !isNonEmptyString(payload.roomCode) || !isSlotIndex(payload.slotIndex)) {
        cb({ ok: false, error: INVALID_PAYLOAD });
        return;
      }
      const { roomCode, slotIndex } = payload;
      store
        .applyAction(roomCode, socket.id, (state, seat) => placeNewPrize(state, seat, slotIndex))
        .then(cb)
        .catch((error) => {
          console.error('[socket:mint-condition] place_new_prize failed:', error);
          cb({ ok: false, error: INTERNAL_ERROR });
        });
    },
  );
}
