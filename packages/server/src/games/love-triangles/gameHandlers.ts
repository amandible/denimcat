import type { Socket } from 'socket.io';
import { buyLink, pass, type GameState, type LoveTrianglesConfig, type SeatId } from '@denimcat/engine-love-triangles';
import { isNonEmptyString, type RoomStore } from '@denimcat/platform';
import { isLinkId } from './validate';

type LoveTrianglesStore = RoomStore<GameState, LoveTrianglesConfig, SeatId>;

const INVALID_PAYLOAD = { code: 'INVALID_PAYLOAD', message: 'Malformed request.' };
const INTERNAL_ERROR = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };

export function registerLoveTrianglesHandlers(socket: Socket, store: LoveTrianglesStore): void {
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
        console.error('[socket:love-triangles] pass failed:', error);
        cb({ ok: false, error: INTERNAL_ERROR });
      });
  });

  socket.on('buy_link', (payload: { roomCode?: unknown; linkId?: unknown }, cb: (res: unknown) => void) => {
    if (!payload || !isNonEmptyString(payload.roomCode) || !isLinkId(payload.linkId)) {
      cb({ ok: false, error: INVALID_PAYLOAD });
      return;
    }
    const { roomCode, linkId } = payload;
    store
      .applyAction(roomCode, socket.id, (state, seat) => buyLink(state, seat, linkId))
      .then(cb)
      .catch((error) => {
        console.error('[socket:love-triangles] buy_link failed:', error);
        cb({ ok: false, error: INTERNAL_ERROR });
      });
  });
}
