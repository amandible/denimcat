import type { Socket } from 'socket.io';
import {
  pass,
  placeBid,
  resolveRuleset,
  takePrize,
  type GameState,
  type MintConditionConfig,
  type SeatId,
} from '@denimcat/engine-mint-condition';
import { isNonEmptyString, type RoomStore } from '@denimcat/platform';
import { isAuctionReward, isAuctionRewardChoiceV2, isCardArray, isSlotIndex } from './validate';

type MintConditionStore = RoomStore<GameState, MintConditionConfig, SeatId>;

const INVALID_PAYLOAD = { code: 'INVALID_PAYLOAD', message: 'Malformed request.' };
const INTERNAL_ERROR = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };

/**
 * Resolves the room's own pinned ruleset — see docs/guides/game-rule-versions.md.
 * `roomCode`'s validity was already checked by the caller before `store.applyAction`
 * ever runs, so a missing room here just falls back to resolveRuleset's own
 * undefined-means-v1 default rather than erroring a second time.
 */
async function rulesetForRoom(store: MintConditionStore, roomCode: string) {
  const room = await store.getRoom(roomCode);
  return resolveRuleset(room?.rulesetVersion);
}

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
    rulesetForRoom(store, roomCode)
      .then((rules) => store.applyAction(roomCode, socket.id, (state, seat) => takePrize(state, seat, prizeId, rules)))
      .then(cb)
      .catch((error) => {
        console.error('[socket:mint-condition] take_prize failed:', error);
        cb({ ok: false, error: INTERNAL_ERROR });
      });
  });

  socket.on(
    'choose_auction_reward',
    (payload: { roomCode?: unknown; reward?: unknown }, cb: (res: unknown) => void) => {
      if (
        !payload ||
        !isNonEmptyString(payload.roomCode) ||
        !(isAuctionReward(payload.reward) || isAuctionRewardChoiceV2(payload.reward))
      ) {
        cb({ ok: false, error: INVALID_PAYLOAD });
        return;
      }
      const { roomCode, reward } = payload;
      rulesetForRoom(store, roomCode)
        .then((rules) => store.applyAction(roomCode, socket.id, (state, seat) => rules.chooseAuctionReward(state, seat, reward, rules)))
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
      rulesetForRoom(store, roomCode)
        .then((rules) => store.applyAction(roomCode, socket.id, (state, seat) => rules.placeNewPrize(state, seat, slotIndex, rules)))
        .then(cb)
        .catch((error) => {
          console.error('[socket:mint-condition] place_new_prize failed:', error);
          cb({ ok: false, error: INTERNAL_ERROR });
        });
    },
  );
}
