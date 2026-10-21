import type { Socket } from 'socket.io';
import type { RoomStore } from '../rooms/roomStore';
import { isNonEmptyString } from './validate';

const INVALID_PAYLOAD = { code: 'INVALID_PAYLOAD', message: 'Malformed request.' };
const INTERNAL_ERROR = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };
/** A display label, not an identity — generous, but still bounded so one player can't wreck the seat-list UI for everyone else in the room. */
const MAX_NAME_LENGTH = 40;

/** Set by index.ts's socket.io auth middleware from the already-verified session — never trust a client-supplied value for identity, only this. */
function accountEmailOf(socket: Socket): string | undefined {
  return (socket.data as { email?: string }).email;
}

function accountDisplayNameOf(socket: Socket): string | undefined {
  return (socket.data as { displayName?: string }).displayName;
}

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

  socket.on('join_room', (payload: { roomCode?: unknown; role?: unknown; email?: unknown; name?: unknown }, cb: (res: unknown) => void) => {
    if (!payload || !isNonEmptyString(payload.roomCode) || !isNonEmptyString(payload.role)) {
      cb({ ok: false, error: INVALID_PAYLOAD });
      return;
    }
    if (payload.email !== undefined && !isNonEmptyString(payload.email)) {
      cb({ ok: false, error: INVALID_PAYLOAD });
      return;
    }
    if (payload.name !== undefined && (!isNonEmptyString(payload.name) || payload.name.length > MAX_NAME_LENGTH)) {
      cb({ ok: false, error: INVALID_PAYLOAD });
      return;
    }
    const roomCode = payload.roomCode;
    const role = payload.role as TSeat | 'spectator';
    const email = payload.email as string | undefined;
    const name = payload.name as string | undefined;
    store
      .joinRoom(roomCode, role, socket.id, email, name, accountEmailOf(socket))
      .then(async (result) => {
        if (result.ok) {
          socket.join(roomCode);
          // The broadcasts inside joinRoom fired before this socket had
          // joined the io room, so seed this socket's own initial view —
          // and resync any targeted per-viewer hint derived from current
          // state (e.g. Hyper Bloom's legal_moves), which otherwise stays
          // stale/empty until the next actual mutation comes along.
          const info = await store.getRoomInfo(roomCode);
          if (info) socket.emit('room_update', info);
          await store.resyncAfterJoin(roomCode);
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
        .reconnectRoom(roomCode, role, seatToken, socket.id, accountEmailOf(socket))
        .then(async (result) => {
          if (result.ok) {
            socket.join(roomCode);
            const info = await store.getRoomInfo(roomCode);
            if (info) socket.emit('room_update', info);
            await store.resyncAfterJoin(roomCode);
          }
          cb(result);
        })
        .catch((error) => {
          console.error('[socket] reconnect_room failed:', error);
          cb({ ok: false, error: INTERNAL_ERROR });
        });
    },
  );

  socket.on('reconnect_by_account', (payload: { roomCode?: unknown }, cb: (res: unknown) => void) => {
    if (!payload || !isNonEmptyString(payload.roomCode)) {
      cb({ ok: false, error: INVALID_PAYLOAD });
      return;
    }
    const accountEmail = accountEmailOf(socket);
    if (!accountEmail) {
      // Shouldn't normally happen — every connected socket passed the
      // site-wide sign-in gate — but fail the same way "no owned seat"
      // does rather than a hard error, since the client treats both
      // identically (fall through to the normal picking-role lobby).
      cb({ ok: false, error: { code: 'NO_OWNED_SEAT', message: 'Not signed in.' } });
      return;
    }
    const roomCode = payload.roomCode;
    store
      .reconnectByAccount(roomCode, accountEmail, socket.id, accountDisplayNameOf(socket))
      .then(async (result) => {
        if (result.ok) {
          socket.join(roomCode);
          const info = await store.getRoomInfo(roomCode);
          if (info) socket.emit('room_update', info);
          await store.resyncAfterJoin(roomCode);
        }
        cb(result);
      })
      .catch((error) => {
        console.error('[socket] reconnect_by_account failed:', error);
        cb({ ok: false, error: INTERNAL_ERROR });
      });
  });

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
