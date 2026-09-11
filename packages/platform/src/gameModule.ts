import type { Socket } from 'socket.io';
import type { RoomStore } from './rooms/roomStore';

export interface AfterMutationContext<TState, TSeat extends string> {
  state: TState;
  seatOrder: readonly TSeat[];
  /** Whatever the acting mutation's own EngineResult.data carried — undefined if it carried none. */
  data: unknown;
  emitToSeat: (seat: TSeat, event: string, payload: unknown) => void;
  /** Broadcasts to every socket in the room (players and spectators alike) — for extra events that aren't per-viewer redacted. */
  broadcastToRoom: (event: string, payload: unknown) => void;
}

/**
 * What a game provides to the platform so `RoomStore` never has to know
 * anything game-specific: how to size a room, how to build its initial
 * state, how to register its own socket verbs, and (optionally) how to
 * redact state per-viewer and push extra targeted events after a mutation.
 */
export interface GameModule<TState, TConfig, TSeat extends string> {
  id: string;
  displayName: string;
  namespace: `/${string}`;
  minSeats: number;
  maxSeats: number;
  /** Validates a raw `create_room` payload into this game's config, or null if invalid. */
  parseConfig(raw: unknown): TConfig | null;
  /** The fixed, ordered list of seat identifiers for a room created with this config. */
  seatsForConfig(config: TConfig): readonly TSeat[];
  createInitialState(config: TConfig, rng?: () => number): TState;
  /** Registers this game's own action events (moves, bids, whatever) on a freshly connected socket. */
  registerHandlers(socket: Socket, store: RoomStore<TState, TConfig, TSeat>): void;
  /** Per-viewer redaction. Omit entirely for a game with no hidden information — the default is a plain broadcast. */
  toView?(state: TState, viewer: TSeat | 'spectator'): unknown;
  /** Runs after every successful mutation; use `emitToSeat` to push extra targeted events (e.g. legal-move hints). */
  afterMutation?(ctx: AfterMutationContext<TState, TSeat>): void;
}
