import type { EngineError } from './result';

export type Role<TSeat extends string> = TSeat | 'spectator';

/**
 * One chat message, meant to be interleaved into a game's own
 * `gameState.log` rather than shown in a separate list — `afterLogIndex`
 * says where: "the log had this many entries when this was sent," so it
 * renders right after `log[afterLogIndex - 1]`. Computed client-side at
 * send time from the sender's own `gameState.log.length` (never
 * server-computed — RoomStore is generic over an opaque game state and
 * must never be asked to inspect any particular game's `log` shape).
 */
export interface ChatMessage {
  id: string;
  /** Whichever role sent it — a seat id, or 'spectator'. */
  seat: string;
  /** The sender's account display name, when set (see Settings) — falls back to a seat label client-side when absent. */
  name?: string;
  text: string;
  /** Wall-clock, display-only (e.g. a hover timestamp) — never used for log ordering. */
  at: number;
  afterLogIndex: number;
}

export interface RoomInfo<TSeat extends string> {
  code: string;
  /** The room's fixed seat list, sized by whatever config it was created with — always present, even for empty seats. */
  seatOrder: TSeat[];
  /**
   * No entry at all means genuinely open — nobody has ever claimed it.
   * `claimed` is the durable fact (survives a lapsed connection — see
   * RoomStore.buildRoomInfo); `connected` is the separate, ordinary
   * live/away signal. `name` is whatever the occupying player optionally
   * supplied — absent if nobody ever gave one — and keeps showing even
   * while `connected` is false.
   */
  seats: Partial<Record<TSeat, { claimed: boolean; connected: boolean; name?: string }>>;
  spectatorCount: number;
  chatMessages: ChatMessage[];
}

export type JoinResult<TSeat extends string, TView> =
  | { ok: true; seatToken?: string; gameState: TView; you: { role: Role<TSeat> } }
  | { ok: false; error: EngineError };

export type ActionResult = { ok: true } | { ok: false; error: EngineError };

export type PeekRoomResult<TSeat extends string> =
  | { ok: true; roomInfo: RoomInfo<TSeat> }
  | { ok: false; error: EngineError };

/**
 * The room-lifecycle events every game shares verbatim: creating, joining,
 * reconnecting to, and leaving a room. A game's own contract extends these
 * with its game-specific verb events (moves, bids, whatever). `TConfig` is
 * whatever a game's `GameModule.parseConfig`/`createInitialState` end up
 * using once validated (e.g. a player count, or Hyper Bloom's
 * `{ specialCircles }`) — games with no configurable options just use
 * `undefined`. `create_room`'s payload itself stays `unknown`, not
 * `TConfig`: `parseConfig(raw: unknown)` is the one place that validates
 * and shapes it, so a client is free to send any room-setup answers raw
 * (e.g. a chosen count rather than an already-resolved list) rather than
 * being required to construct a pre-validated `TConfig` itself.
 */
export interface RoomLifecycleClientToServerEvents<TSeat extends string, TConfig, TView> {
  create_room: (config: unknown, cb: (res: { ok: true; roomCode: string } | { ok: false; error: EngineError }) => void) => void;
  /** Read-only: lets a client learn a room's actual seat list before choosing a role — binds nothing, joins no seat. */
  peek_room: (payload: { roomCode: string }, cb: (res: PeekRoomResult<TSeat>) => void) => void;
  /**
   * `email` and `name` are both optional and only meaningful for a real seat
   * (ignored for 'spectator'): `email` is used for RoomStore's async-play
   * turn notifications, while `name` is purely a display label shown to
   * other players (in RoomInfo.seats) for as long as the seat is occupied —
   * it is never validated for uniqueness and carries no other meaning.
   */
  join_room: (payload: { roomCode: string; role: Role<TSeat>; email?: string; name?: string }, cb: (res: JoinResult<TSeat, TView>) => void) => void;
  reconnect_room: (
    payload: { roomCode: string; role: TSeat; seatToken: string },
    cb: (res: JoinResult<TSeat, TView>) => void,
  ) => void;
  /**
   * Tried before falling back to peek_room/picking-role when this browser
   * has no locally-stored seat token for the room: lets the server's
   * record of which signed-in account last held each seat (independent of
   * any particular browser's seat token, and outliving a lapsed reconnect
   * grace) silently reconnect a returning player — a different device, or
   * this same browser well after its stored token went stale. `{ok:false}`
   * (no error worth surfacing) just means no seat here is tied to this
   * account yet — the normal case for a brand-new player.
   */
  reconnect_by_account: (payload: { roomCode: string }, cb: (res: JoinResult<TSeat, TView>) => void) => void;
  leave_seat: (payload: { roomCode: string }, cb: (res: { ok: true }) => void) => void;
  /** `afterLogIndex` is the sender's own `gameState.log.length` at send time — see ChatMessage's doc comment. */
  send_chat: (payload: { roomCode: string; text: string; afterLogIndex: number }, cb: (res: ActionResult) => void) => void;
}

export interface RoomLifecycleServerToClientEvents<TSeat extends string, TView> {
  game_state: (view: TView) => void;
  room_update: (info: RoomInfo<TSeat>) => void;
  seat_taken_over: (payload: { role: TSeat }) => void;
  seat_freed: (payload: { role: TSeat }) => void;
  error: (payload: EngineError) => void;
  room_closed: (payload: { reason: string }) => void;
}
