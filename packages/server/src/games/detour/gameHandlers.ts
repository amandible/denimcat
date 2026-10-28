import type { Socket } from 'socket.io';
import { playCard, type DetourConfig, type GameState, type SeatId } from '@denimcat/engine-detour';
import { isNonEmptyString, type RoomStore } from '@denimcat/platform';
import { isCardValue, isCellId } from './validate';

type DetourStore = RoomStore<GameState, DetourConfig, SeatId>;

const INVALID_PAYLOAD = { code: 'INVALID_PAYLOAD', message: 'Malformed request.' };
const INTERNAL_ERROR = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };

export function registerDetourHandlers(socket: Socket, store: DetourStore): void {
  socket.on(
    'play_card',
    (payload: { roomCode?: unknown; value?: unknown; target?: unknown }, cb: (res: unknown) => void) => {
      if (!payload || !isNonEmptyString(payload.roomCode) || !isCardValue(payload.value) || !isCellId(payload.target)) {
        cb({ ok: false, error: INVALID_PAYLOAD });
        return;
      }
      const { roomCode, value, target } = payload;
      store
        .applyAction(roomCode, socket.id, (state, seat) => playCard(state, seat, value, target))
        .then(cb)
        .catch((error) => {
          console.error('[socket:detour] play_card failed:', error);
          cb({ ok: false, error: INTERNAL_ERROR });
        });
    },
  );
}
