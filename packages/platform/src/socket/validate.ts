/**
 * A connected client is untrusted input, not just our own TypeScript
 * client — anyone can open a raw WebSocket and send arbitrary JSON. This
 * guard runs before a payload field reaches RoomStore. Note that "is this
 * seat actually valid for this room" is deliberately NOT checked here —
 * the platform doesn't know a room's seat list without looking the room
 * up (it varies per game, and per room for games with configurable seat
 * counts), so that check lives in RoomStore itself (`seatOrder.includes`).
 * This only guards shape.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
