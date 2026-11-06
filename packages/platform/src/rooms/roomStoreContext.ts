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
  /** See PersistedRoom.rulesetVersion's doc comment. Genuinely undefined for most games/rooms, not just "not yet populated." */
  rulesetVersion?: string;
  spectatorSocketIds: Set<string>;
  createdAt: number;
  lastActivityAt: number;
}

export type SocketBinding<TSeat extends string> = { code: string; role: Role<TSeat> };

/** One open room an account holds a seat in — see RoomStore.listOpenRoomsForAccount. */
export interface OpenGameSummary<TSeat extends string> {
  gameId: string;
  code: string;
  /** Every seat this account holds — more than one only for a hotseat room, where every seat was joined from the same authenticated browser. */
  mySeats: TSeat[];
  /** room.seatOrder.length — lets the caller detect "I hold every seat" (hotseat) without re-deriving it. */
  seatCount: number;
  /**
   * 'your-turn': the game isn't finished and it's one of mySeats' turn.
   * 'waiting': the game isn't finished and it isn't my turn.
   * 'recap': the game has finished and I haven't viewed it yet (see
   * PersistedRoom.recapViewedBy) — once viewed, the room drops off the
   * list entirely rather than reporting a fourth status.
   */
  status: 'your-turn' | 'waiting' | 'recap';
  lastActivityAt: number;
  createdAt: number;
  /** True when no OTHER seat has ever been joined by a different account — see RoomStore.abandonRoom, which re-verifies this itself rather than trusting the caller. False once the game has finished: an ended game isn't "abandoned," it's over. */
  abandonable: boolean;
  /** Display names of every OTHER seat that has ever supplied one (knownNames), in seat order — skips seats nobody's joined yet or that joined with no name given. */
  otherPlayerNames: string[];
}

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
