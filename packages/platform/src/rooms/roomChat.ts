import { nanoid } from 'nanoid';
import type { ActionResult, ChatMessage } from '@denimcat/shared';
import { getRoom, persist } from './roomCore';
import { broadcastRoomInfo } from './roomBroadcast';
import type { RoomStoreContext } from './roomStoreContext';

/** Oldest messages drop once a room's chat exceeds this, bounding the per-room JSONB blob for long-running async games. */
const MAX_CHAT_HISTORY = 200;

/**
 * Appends a chat message and broadcasts the updated room info — chat
 * rides along on the existing RoomInfo/room_update mechanism rather
 * than its own event type. `afterLogIndex` is client-computed (see
 * ChatMessage's doc comment in @denimcat/shared): this method never
 * inspects `room.gameState` itself, since RoomStore is generic over an
 * opaque game state and must stay that way. `senderName` comes from
 * the caller (roomHandlers.ts's accountDisplayNameOf) — RoomStore has
 * no socket access of its own.
 */
export async function sendChatMessage<TState, TConfig, TSeat extends string>(
  ctx: RoomStoreContext<TState, TConfig, TSeat>,
  code: string,
  socketId: string,
  text: string,
  afterLogIndex: number,
  senderName?: string,
): Promise<ActionResult> {
  const room = await getRoom(ctx, code);
  if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };
  const binding = ctx.socketBindings.get(socketId);
  if (!binding || binding.code !== code) {
    return { ok: false, error: { code: 'NOT_IN_ROOM', message: 'Not connected to this room.' } };
  }
  // A seat's own per-room join name (knownNames — see RoomInfo.seats'
  // doc comment) wins over the account-level Settings display name
  // passed in as `senderName`: a player may have typed a one-off name
  // for this game without ever setting one in Settings, and that's the
  // name they'd expect to be recognized by here. A spectator has no
  // seat, so no per-room name is possible — senderName (their account
  // name, if any) is all there is for them.
  const seatName = binding.role !== 'spectator' ? room.knownNames[binding.role] : undefined;
  const message: ChatMessage = {
    id: nanoid(8),
    seat: binding.role,
    name: seatName ?? senderName,
    text,
    at: Date.now(),
    afterLogIndex,
  };
  room.chatMessages.push(message);
  if (room.chatMessages.length > MAX_CHAT_HISTORY) room.chatMessages.shift();
  room.lastActivityAt = Date.now();
  await persist(ctx, room);
  broadcastRoomInfo(ctx, room);
  return { ok: true };
}
