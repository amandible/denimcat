import type { Namespace } from 'socket.io';
import type { ChatMessage, Role } from '@denimcat/shared';
import type { EmailSender } from '../email';
import type { GameModule } from '../gameModule';
import type { RoomRepository } from './roomRepository';

export interface LiveSeat {
  seatToken: string;
  socketId: string | null;
  disconnectedAt: number | null;
  /** Optional, supplied at join time — see RoomStoreOptions.emailSender's doc comment for what it's used for. */
  email?: string;
  /** Optional, supplied at join time — a display label shown to other players (via buildRoomInfo) for as long as this seat stays occupied. Never validated for uniqueness. */
  name?: string;
}

export interface LiveRoom<TState, TSeat extends string> {
  code: string;
  /** Durable identity, independent of `code` — see PersistedRoom.roomId's doc comment. Always populated once live, unlike the persisted shape's optional field. */
  roomId: string;
  gameState: TState;
  seatOrder: readonly TSeat[];
  seats: Partial<Record<TSeat, LiveSeat>>;
  /** Every email any seat has EVER supplied — see PersistedRoom.knownEmails's doc comment for why this outlives `seats`. */
  knownEmails: Partial<Record<TSeat, string>>;
  /** Every signed-in account that has EVER held a seat — see PersistedRoom.knownAccounts's doc comment. */
  knownAccounts: Partial<Record<TSeat, string>>;
  /** Every display name any seat has EVER supplied — see PersistedRoom.knownNames's doc comment for why this outlives `seats`. */
  knownNames: Partial<Record<TSeat, string>>;
  /** See PersistedRoom.chatMessages's doc comment. */
  chatMessages: ChatMessage[];
  /** See PersistedRoom.recapViewedBy's doc comment — keyed by account email, not seat. */
  recapViewedBy: Record<string, true>;
  spectatorSocketIds: Set<string>;
  createdAt: number;
  lastActivityAt: number;
}

export type SocketBinding<TSeat extends string> = { code: string; role: Role<TSeat> };

/**
 * Every piece of RoomStore's per-instance mutable state and
 * constructor-injected dependencies, as plain data — no function
 * members. Every extracted roomXxx.ts file's functions take this as
 * their first argument; cross-group calls (e.g. roomIdleSweep.ts calling
 * roomMembership.ts's clearGraceTimer) are plain module imports between
 * those files, not function fields on this context, which avoids a
 * chicken-and-egg self-reference problem when RoomStore builds its one
 * context instance in its constructor.
 */
export interface RoomStoreContext<TState, TConfig, TSeat extends string> {
  module: GameModule<TState, TConfig, TSeat>;
  repository: RoomRepository<TState, TSeat>;
  nsp: Namespace;
  cache: Map<string, LiveRoom<TState, TSeat>>;
  /**
   * De-dupes concurrent hydration of the same not-yet-cached room code. Two
   * sockets reconnecting at nearly the same instant (e.g. right after a Fly
   * machine cold-starts and both players' clients auto-reconnect together)
   * would otherwise each build and cache their own separate LiveRoom object
   * for the same code — whichever cache.set() runs second wins, silently
   * orphaning the socket bound to the first object, which then never
   * receives another broadcast again.
   */
  hydrating: Map<string, Promise<LiveRoom<TState, TSeat> | null>>;
  socketBindings: Map<string, SocketBinding<TSeat>>;
  graceTimers: Map<string, NodeJS.Timeout>;
  graceMs: number;
  idleTimeoutMs: number;
  idleTimeoutAfterRecapMs: number;
  emailSender: EmailSender;
  appBaseUrl?: string;
}
