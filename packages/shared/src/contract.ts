import type { EngineError } from './result';

export type Role<TSeat extends string> = TSeat | 'spectator';

export interface RoomInfo<TSeat extends string> {
  code: string;
  /** The room's fixed seat list, sized by whatever config it was created with — always present, even for empty seats. */
  seatOrder: TSeat[];
  seats: Partial<Record<TSeat, { connected: boolean }>>;
  spectatorCount: number;
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
  join_room: (payload: { roomCode: string; role: Role<TSeat> }, cb: (res: JoinResult<TSeat, TView>) => void) => void;
  reconnect_room: (
    payload: { roomCode: string; role: TSeat; seatToken: string },
    cb: (res: JoinResult<TSeat, TView>) => void,
  ) => void;
  leave_seat: (payload: { roomCode: string }, cb: (res: { ok: true }) => void) => void;
}

export interface RoomLifecycleServerToClientEvents<TSeat extends string, TView> {
  game_state: (view: TView) => void;
  room_update: (info: RoomInfo<TSeat>) => void;
  seat_taken_over: (payload: { role: TSeat }) => void;
  seat_freed: (payload: { role: TSeat }) => void;
  error: (payload: EngineError) => void;
  room_closed: (payload: { reason: string }) => void;
}
