import { nanoid } from 'nanoid';
import type { Namespace } from 'socket.io';
import type { ActionResult, ChatMessage, JoinResult, Role, RoomInfo } from '@denimcat/shared';
import { createNoopEmailSender, type EmailSender } from '../email';
import type { GameModule } from '../gameModule';
import type { RoomRepository } from './roomRepository';
import type { LiveRoom, RoomStoreContext } from './roomStoreContext';
import { applyAction as applyActionImpl, createRoom as createRoomImpl, getRoom as getRoomImpl, getRoomInfo as getRoomInfoImpl, persist, resyncAfterJoin as resyncAfterJoinImpl, clearGraceTimer } from './roomCore';
import { broadcastRoomInfo } from './roomBroadcast';
import { joinRoom as joinRoomImpl, reconnectRoom as reconnectRoomImpl, reconnectByAccount as reconnectByAccountImpl, leaveSeat as leaveSeatImpl, handleDisconnect as handleDisconnectImpl } from './roomMembership';

const RECONNECT_GRACE_MS = 2 * 60 * 1000;
const IDLE_SWEEP_INTERVAL_MS = 60 * 1000;
/**
 * Applies only to a never-claimed room (nobody, not even the creator, ever
 * actually joined a seat) — a claimed-but-unfinished room is permanently
 * exempt from the sweep regardless of any timeout (see
 * isPermanentlyExemptFromSweep), and a finished-and-fully-viewed room uses
 * IDLE_ROOM_TIMEOUT_AFTER_RECAP_MS instead — see idleTimeoutFor.
 */
const IDLE_ROOM_TIMEOUT_MS = 30 * 60 * 1000;
/**
 * Gives a finished, fully-recap-viewed room a week before it's swept, so
 * someone can still come back and look at how a game wrapped up a few days
 * later. Longer than IDLE_ROOM_TIMEOUT_MS deliberately — there's no urgency
 * to reclaim a finished room the way there is for one nobody ever claimed.
 */
const IDLE_ROOM_TIMEOUT_AFTER_RECAP_MS = 7 * 24 * 60 * 60 * 1000;
/** Oldest messages drop once a room's chat exceeds this, bounding the per-room JSONB blob for long-running async games. */
const MAX_CHAT_HISTORY = 200;

export interface RoomStoreOptions {
  graceMs?: number;
  idleSweepMs?: number;
  idleTimeoutMs?: number;
  /** Applied instead of `idleTimeoutMs` for a finished room once every account that held a seat has viewed its recap — see IDLE_ROOM_TIMEOUT_AFTER_RECAP_MS. */
  idleTimeoutAfterRecapMs?: number;
  /**
   * Async play: sends a "it's your turn" email when GameModule.getActiveSeat
   * hands the turn to a seat that has no live socket connected right now
   * (see applyAction's notifyTurnIfOffline). Defaults to a noop sender, so
   * existing callers/tests that construct a RoomStore directly don't need
   * to change anything.
   */
  emailSender?: EmailSender;
  /** Canonical base URL (e.g. `https://denimcat.ancepp-glos.com`) used only to build a turn-notification email's reconnect link — see GameModule.roomUrlPath. Omit to send notifications without a clickable link. */
  appBaseUrl?: string;
}

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
 * Owns all live room state for one game: an in-memory cache for fast
 * per-move access, write-through/read-through to a RoomRepository (Neon in
 * production, an in-memory fake in tests) for durability across restarts,
 * per-seat reconnect grace periods, and idle-room cleanup. Knows nothing
 * about any specific game's rules — everything game-specific comes from the
 * `GameModule` passed in at construction.
 *
 * Mostly a thin facade: every method delegates to a plain function in
 * roomCore.ts/roomBroadcast.ts/etc., passing the one `ctx` object built in
 * the constructor. See docs/superpowers/specs/2026-11-04-roomstore-decomposition-design.md.
 */
export class RoomStore<TState, TConfig, TSeat extends string> {
  private ctx: RoomStoreContext<TState, TConfig, TSeat>;
  private sweepTimer: NodeJS.Timeout;

  constructor(module: GameModule<TState, TConfig, TSeat>, repository: RoomRepository<TState, TSeat>, nsp: Namespace, options: RoomStoreOptions = {}) {
    this.ctx = {
      module,
      repository,
      nsp,
      cache: new Map(),
      hydrating: new Map(),
      socketBindings: new Map(),
      graceTimers: new Map(),
      graceMs: options.graceMs ?? RECONNECT_GRACE_MS,
      idleTimeoutMs: options.idleTimeoutMs ?? IDLE_ROOM_TIMEOUT_MS,
      idleTimeoutAfterRecapMs: options.idleTimeoutAfterRecapMs ?? IDLE_ROOM_TIMEOUT_AFTER_RECAP_MS,
      emailSender: options.emailSender ?? createNoopEmailSender(),
      appBaseUrl: options.appBaseUrl,
    };
    this.sweepTimer = setInterval(
      () => this.sweepIdleRooms().catch((error) => console.error(`[roomStore:${this.ctx.module.id}] idle sweep failed:`, error)),
      options.idleSweepMs ?? IDLE_SWEEP_INTERVAL_MS,
    );
    this.sweepTimer.unref?.();
  }

  stop(): void {
    clearInterval(this.sweepTimer);
    for (const timer of this.ctx.graceTimers.values()) clearTimeout(timer);
    this.ctx.graceTimers.clear();
  }

  async createRoom(rawConfig: unknown): Promise<{ ok: true; roomCode: string } | { ok: false; error: { code: string; message: string } }> {
    return createRoomImpl(this.ctx, rawConfig);
  }

  async getRoom(code: string): Promise<LiveRoom<TState, TSeat> | null> {
    return getRoomImpl(this.ctx, code);
  }

  async joinRoom(code: string, role: Role<TSeat>, socketId: string, email?: string, name?: string, accountEmail?: string): Promise<JoinResult<TSeat, unknown>> {
    return joinRoomImpl(this.ctx, code, role, socketId, email, name, accountEmail);
  }

  async reconnectRoom(code: string, role: TSeat, seatToken: string, socketId: string, accountEmail?: string): Promise<JoinResult<TSeat, unknown>> {
    return reconnectRoomImpl(this.ctx, code, role, seatToken, socketId, accountEmail);
  }

  async reconnectByAccount(code: string, accountEmail: string, socketId: string, fallbackName?: string): Promise<JoinResult<TSeat, unknown>> {
    return reconnectByAccountImpl(this.ctx, code, accountEmail, socketId, fallbackName);
  }

  async leaveSeat(code: string, socketId: string): Promise<void> {
    return leaveSeatImpl(this.ctx, code, socketId);
  }

  async handleDisconnect(socketId: string): Promise<void> {
    return handleDisconnectImpl(this.ctx, socketId);
  }

  async applyAction(code: string, socketId: string, action: (state: TState, seat: TSeat) => import('@denimcat/shared').EngineResult<TState, any>): Promise<ActionResult> {
    return applyActionImpl(this.ctx, code, socketId, action);
  }

  async resyncAfterJoin(code: string): Promise<void> {
    return resyncAfterJoinImpl(this.ctx, code);
  }

  /** Seeds a socket's own initial view right after it joins the io room (the broadcast above fires before that). */
  async getRoomInfo(code: string): Promise<RoomInfo<TSeat> | null> {
    return getRoomInfoImpl(this.ctx, code);
  }

  /**
   * Every one of this game's rooms where `email` holds a seat, EXCEPT a
   * finished room this account has already viewed the recap of (see
   * PersistedRoom.recapViewedBy) — feeds the landing page's "your games"
   * list (see GET /my-games). `mySeats` is every seat this account holds,
   * which for a hotseat room (every seat joined from the same
   * authenticated browser) is the full seat list — that's what lets
   * 'your-turn' read as "always true" for hotseat with no special-casing:
   * whenever any seat is active, it's necessarily one of `mySeats`. The
   * "viewed" check is account-level, not per-seat, for the same reason —
   * one visit from a hotseat player clears the whole room at once.
   */
  async listOpenRoomsForAccount(email: string): Promise<OpenGameSummary<TSeat>[]> {
    const rooms = await this.ctx.repository.findByAccountEmail(this.ctx.module.id, email);
    const out: OpenGameSummary<TSeat>[] = [];
    for (const room of rooms) {
      const isFinished = this.ctx.module.isRoomFinished?.(room.gameState) ?? false;
      if (isFinished && room.recapViewedBy?.[email]) continue; // seen it — same as the old unconditional skip, now gated on having actually looked
      const mySeats = room.seatOrder.filter((seat) => room.knownAccounts?.[seat] === email);
      const activeSeat = this.ctx.module.getActiveSeat?.(room.gameState) ?? null;
      const otherPlayerNames = room.seatOrder
        .filter((seat) => !mySeats.includes(seat))
        .map((seat) => room.knownNames?.[seat])
        .filter((name): name is string => !!name);
      const status: OpenGameSummary<TSeat>['status'] = isFinished
        ? 'recap'
        : activeSeat !== null && mySeats.includes(activeSeat)
          ? 'your-turn'
          : 'waiting';
      out.push({
        gameId: this.ctx.module.id,
        code: room.code,
        mySeats,
        seatCount: room.seatOrder.length,
        status,
        lastActivityAt: room.lastActivityAt,
        createdAt: room.createdAt,
        abandonable: !isFinished && this.isAbandonable(room.seatOrder, room.knownAccounts, mySeats),
        otherPlayerNames,
      });
    }
    return out;
  }

  /** True when no seat outside `mySeats` has ever been joined by a different account — see OpenGameSummary.abandonable and abandonRoom. */
  private isAbandonable(seatOrder: readonly TSeat[], knownAccounts: Partial<Record<TSeat, string>> | undefined, mySeats: TSeat[]): boolean {
    return seatOrder.every((seat) => mySeats.includes(seat) || knownAccounts?.[seat] === undefined);
  }

  /**
   * Deletes an abandoned room outright — offered client-side only when
   * `listOpenRoomsForAccount` reported it `abandonable`, but re-verified
   * here rather than trusted from the caller, since another account
   * could have joined a seat between when that list was fetched and
   * this call landing. Clears any pending reconnect-grace timers for
   * this room's seats (same cleanup sweepIdleRooms already does) and
   * tells any still-connected socket (e.g. this same account open in
   * another tab) the room is gone, via the existing (currently unused
   * elsewhere) room_closed event, before actually deleting. Named
   * "abandon" rather than "cancel" throughout this feature — a "Cancel"
   * button next to a confirm dialog that itself has a Cancel option is
   * confusing.
   */
  async abandonRoom(code: string, accountEmail: string): Promise<ActionResult> {
    const room = await this.getRoom(code);
    if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };
    const mySeats = room.seatOrder.filter((seat) => room.knownAccounts[seat] === accountEmail);
    if (mySeats.length === 0) {
      return { ok: false, error: { code: 'NOT_YOUR_ROOM', message: 'You do not hold a seat in this room.' } };
    }
    if (!this.isAbandonable(room.seatOrder, room.knownAccounts, mySeats)) {
      return { ok: false, error: { code: 'NOT_ABANDONABLE', message: 'Another player has joined this room.' } };
    }
    for (const seat of room.seatOrder) clearGraceTimer(this.ctx, code, seat);
    this.ctx.nsp.to(code).emit('room_closed', { reason: 'abandoned' });
    this.ctx.cache.delete(code);
    await this.ctx.repository.delete(code);
    return { ok: true };
  }

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
  async sendChatMessage(code: string, socketId: string, text: string, afterLogIndex: number, senderName?: string): Promise<ActionResult> {
    const room = await this.getRoom(code);
    if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };
    const binding = this.ctx.socketBindings.get(socketId);
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
    await persist(this.ctx, room);
    broadcastRoomInfo(this.ctx, room);
    return { ok: true };
  }

  /**
   * True once ANY seat has ever been claimed by a known account or email —
   * the durable record (PersistedRoom.knownAccounts/knownEmails), not the
   * live `seats` map, which only reflects who's *currently* connected and
   * is deliberately short-lived (see expireSeat's 2-minute reconnect
   * grace).
   */
  private hasEverBeenClaimed(room: LiveRoom<TState, TSeat>): boolean {
    return Object.keys(room.knownAccounts).length > 0 || Object.keys(room.knownEmails).length > 0;
  }

  /**
   * Guards sweepIdleRooms: a claimed-but-unfinished room must never be
   * auto-deleted just because its last connected player's live record
   * lapsed — only explicit abandonment should remove it (see
   * abandonRoom/isAbandonable, which already reads knownAccounts, not
   * `seats`, for the identical reason). Confirmed with the designer after
   * a real-world bug report: rooms were disappearing mid-invite because
   * the creator's own seat record lapsed before anyone else joined.
   * Deliberately NOT permanent once the game has actually finished,
   * though — recapFullyViewed already keeps a finished-but-unviewed room
   * alive, and once every claimant has seen the result there's no reason
   * left to hold onto it forever; ordinary idle cleanup should still
   * eventually reclaim it, the same as any other finished game.
   */
  private isPermanentlyExemptFromSweep(room: LiveRoom<TState, TSeat>): boolean {
    const isFinished = this.ctx.module.isRoomFinished?.(room.gameState) ?? false;
    return !isFinished && this.hasEverBeenClaimed(room);
  }

  /**
   * True once every account that ever held a seat here has viewed this
   * room's recap — false (never sweep) for a room that isn't finished at
   * all, since that's not what this check is about. Guards sweepIdleRooms:
   * without it, a finished-but-unviewed room (the exact case the "recap"
   * status exists for) could get deleted by the ordinary idle timeout
   * before the slowest account to look ever gets the chance — directly
   * breaking the "stays on the list until viewed, full stop" promise.
   */
  private recapFullyViewed(room: LiveRoom<TState, TSeat>): boolean {
    if (!this.ctx.module.isRoomFinished?.(room.gameState)) return true;
    const accounts = new Set(Object.values(room.knownAccounts).filter((email): email is string => !!email));
    for (const email of accounts) {
      if (!room.recapViewedBy[email]) return false;
    }
    return true;
  }

  /**
   * A finished room gets the LONGER post-recap grace (days, not minutes) —
   * by the time it's reachable here at all, isPermanentlyExemptFromSweep
   * has already ruled out every unfinished room, so `isFinished` true means
   * this is specifically a finished-and-fully-viewed room (recapFullyViewed
   * already guards the finished-but-unviewed case in sweepIdleRooms), the
   * exact case IDLE_ROOM_TIMEOUT_AFTER_RECAP_MS exists for. Everything else
   * reaching this point is a room nobody ever claimed at all, which keeps
   * the ordinary short timeout — there's nothing to come back and look at.
   */
  private idleTimeoutFor(room: LiveRoom<TState, TSeat>): number {
    const isFinished = this.ctx.module.isRoomFinished?.(room.gameState) ?? false;
    return isFinished ? this.ctx.idleTimeoutAfterRecapMs : this.ctx.idleTimeoutMs;
  }

  private async sweepIdleRooms(): Promise<void> {
    const now = Date.now();
    for (const [code, room] of this.ctx.cache) {
      // A live, currently-connected seat always implies knownAccounts is
      // already set for it (every join is account-authenticated — see
      // hasEverBeenClaimed), so checking seats here too would be redundant;
      // an active spectator has no durable claim at all, so it still needs
      // its own check.
      const hasActiveSpectator = room.spectatorSocketIds.size > 0;
      if (
        !hasActiveSpectator &&
        !this.isPermanentlyExemptFromSweep(room) &&
        now - room.lastActivityAt > this.idleTimeoutFor(room) &&
        this.recapFullyViewed(room)
      ) {
        this.ctx.cache.delete(code);
        await this.ctx.repository.delete(code);
      }
    }
  }
}
