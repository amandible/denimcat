import type { Namespace } from 'socket.io';
import type { ActionResult, JoinResult, Role, RoomInfo } from '@denimcat/shared';
import { createNoopEmailSender, type EmailSender } from '../email';
import type { GameModule } from '../gameModule';
import type { RoomRepository } from './roomRepository';
import type { LiveRoom, OpenGameSummary, RoomStoreContext } from './roomStoreContext';
export type { OpenGameSummary } from './roomStoreContext';
import { applyAction as applyActionImpl, createRoom as createRoomImpl, getRoom as getRoomImpl, getRoomInfo as getRoomInfoImpl, resyncAfterJoin as resyncAfterJoinImpl } from './roomCore';
import { joinRoom as joinRoomImpl, reconnectRoom as reconnectRoomImpl, reconnectByAccount as reconnectByAccountImpl, leaveSeat as leaveSeatImpl, handleDisconnect as handleDisconnectImpl } from './roomMembership';
import { abandonRoom as abandonRoomImpl, listOpenRoomsForAccount as listOpenRoomsForAccountImpl, sweepIdleRooms } from './roomIdleSweep';
import { sendChatMessage as sendChatMessageImpl } from './roomChat';

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
      () => sweepIdleRooms(this.ctx).catch((error) => console.error(`[roomStore:${this.ctx.module.id}] idle sweep failed:`, error)),
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

  async listOpenRoomsForAccount(email: string): Promise<OpenGameSummary<TSeat>[]> {
    return listOpenRoomsForAccountImpl(this.ctx, email);
  }

  async abandonRoom(code: string, accountEmail: string): Promise<ActionResult> {
    return abandonRoomImpl(this.ctx, code, accountEmail);
  }

  async sendChatMessage(code: string, socketId: string, text: string, afterLogIndex: number, senderName?: string): Promise<ActionResult> {
    return sendChatMessageImpl(this.ctx, code, socketId, text, afterLogIndex, senderName);
  }
}
