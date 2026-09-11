import type { Socket } from 'socket.io';
import type { RoomStore } from '../rooms/roomStore';
import { isNonEmptyString } from './validate';

const INVALID_PAYLOAD = { code: 'INVALID_PAYLOAD', message: 'Malformed request.' };
const INTERNAL_ERROR = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };

/**
 * The four room-lifecycle events every game shares verbatim. Note "is this
 * seat valid for this room" is intentionally not checked here — only
 * RoomStore knows a room's actual seat list (see validate.ts) — so `role`
 * is only shape-checked (a non-empty string) here and cast through; the
 * real membership check happens inside RoomStore.joinRoom/reconnectRoom.
 */
export function registerRoomHandlers<TState, TConfig, TSeat extends string>(
  socket: Socket,
  store: RoomStore<TState, TConfig, TSeat>,
): void {
  socket.on('create_room', (config: unknown, cb: (res: unknown) => void) => {
    store
      .createRoom(config)
      .then(cb)
      .catch((error) => {
        console.error('[socket] create_room failed:', error);
        cb({ ok: false, error: INTERNAL_ERROR });
      });
  });

  socket.on('peek_room', (payload: { roomCode?: unknown }, cb: (res: unknown) => void) => {
    if (!payload || !isNonEmptyString(payload.roomCode)) {
      cb({ ok: false, error: INVALID_PAYLOAD });
      return;
    }
    store
      .getRoomInfo(payload.roomCode)
      .then((roomInfo) => {
        if (roomInfo) cb({ ok: true, roomInfo });
        else cb({ ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } });
      })
      .catch((error) => {
        console.error('[socket] peek_room failed:', error);
        cb({ ok: false, error: INTERNAL_ERROR });
      });
  });

  socket.on('join_room', (payload: { roomCode?: unknown; role?: unknown }, cb: (res: unknown) => void) => {
    if (!payload || !isNonEmptyString(payload.roomCode) || !isNonEmptyString(payload.role)) {
      cb({ ok: false, error: INVALID_PAYLOAD });
      return;
    }
    const roomCode = payload.roomCode;
    const role = payload.role as TSeat | 'spectator';
    store
      .joinRoom(roomCode, role, socket.id)
      .then(async (result) => {
        if (result.ok) {
          socket.join(roomCode);
          // The broadcast inside joinRoom fired before this socket had
          // joined the io room, so seed this socket's own initial view.
          const info = await store.getRoomInfo(roomCode);
          if (info) socket.emit('room_update', info);
        }
        cb(result);
      })
      .catch((error) => {
        console.error('[socket] join_room failed:', error);
        cb({ ok: false, error: INTERNAL_ERROR });
      });
  });

  socket.on(
    'reconnect_room',
    (payload: { roomCode?: unknown; role?: unknown; seatToken?: unknown }, cb: (res: unknown) => void) => {
      if (
        !payload ||
        !isNonEmptyString(payload.roomCode) ||
        !isNonEmptyString(payload.role) ||
        !isNonEmptyString(payload.seatToken)
      ) {
        cb({ ok: false, error: INVALID_PAYLOAD });
        return;
      }
      const roomCode = payload.roomCode;
      const role = payload.role as TSeat;
      const seatToken = payload.seatToken;
      store
        .reconnectRoom(roomCode, role, seatToken, socket.id)
        .then(async (result) => {
          if (result.ok) {
            socket.join(roomCode);
            const info = await store.getRoomInfo(roomCode);
            if (info) socket.emit('room_update', info);
          }
          cb(result);
        })
        .catch((error) => {
          console.error('[socket] reconnect_room failed:', error);
          cb({ ok: false, error: INTERNAL_ERROR });
        });
    },
  );

  socket.on('leave_seat', (payload: { roomCode?: unknown }, cb: (res: { ok: true }) => void) => {
    if (!payload || !isNonEmptyString(payload.roomCode)) {
      cb({ ok: true });
      return;
    }
    const roomCode = payload.roomCode;
    store
      .leaveSeat(roomCode, socket.id)
      .then(() => {
        socket.leave(roomCode);
        cb({ ok: true });
      })
      .catch((error) => {
        console.error('[socket] leave_seat failed:', error);
        cb({ ok: true });
      });
  });
}
