import { nanoid } from 'nanoid';
import type { Namespace } from 'socket.io';
import type { ActionResult, EngineResult, JoinResult, Role, RoomInfo } from '@denimcat/shared';
import { createNoopEmailSender, type EmailSender } from '../email';
import type { GameModule } from '../gameModule';
import { generateRoomCode } from './roomCode';
import type { PersistedRoom, RoomRepository } from './roomRepository';

const RECONNECT_GRACE_MS = 2 * 60 * 1000;
const IDLE_SWEEP_INTERVAL_MS = 60 * 1000;
const IDLE_ROOM_TIMEOUT_MS = 30 * 60 * 1000;
/**
 * A room where ANY seat has ever supplied an email (see LiveRoom.knownEmails
 * and idleTimeoutFor's own doc comment for why "any" rather than "every")
 * reads as a real async game rather than an abandoned/hotseat-testing one —
 * give it weeks, not minutes, so two players genuinely trading moves days
 * apart can never lose to this sweep. There's no real cost to a dormant
 * room sitting in Postgres this long (one JSONB row).
 */
const IDLE_ROOM_TIMEOUT_WITH_EMAILS_MS = 14 * 24 * 60 * 60 * 1000;

interface LiveSeat {
  seatToken: string;
  socketId: string | null;
  disconnectedAt: number | null;
  /** Optional, supplied at join time — see RoomStoreOptions.emailSender's doc comment for what it's used for. */
  email?: string;
}

interface LiveRoom<TState, TSeat extends string> {
  code: string;
  gameState: TState;
  seatOrder: readonly TSeat[];
  seats: Partial<Record<TSeat, LiveSeat>>;
  /** Every email any seat has EVER supplied — see PersistedRoom.knownEmails's doc comment for why this outlives `seats`. */
  knownEmails: Partial<Record<TSeat, string>>;
  spectatorSocketIds: Set<string>;
  createdAt: number;
  lastActivityAt: number;
}

type SocketBinding<TSeat extends string> = { code: string; role: Role<TSeat> };

export interface RoomStoreOptions {
  graceMs?: number;
  idleSweepMs?: number;
  idleTimeoutMs?: number;
  /** Applied instead of `idleTimeoutMs` for a room where any seat has ever supplied an email — see IDLE_ROOM_TIMEOUT_WITH_EMAILS_MS. */
  idleTimeoutWithEmailsMs?: number;
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
 */
export class RoomStore<TState, TConfig, TSeat extends string> {
  private cache = new Map<string, LiveRoom<TState, TSeat>>();
  /**
   * De-dupes concurrent hydration of the same not-yet-cached room code. Two
   * sockets reconnecting at nearly the same instant (e.g. right after a Fly
   * machine cold-starts and both players' clients auto-reconnect together)
   * would otherwise each build and cache their own separate LiveRoom object
   * for the same code — whichever cache.set() runs second wins, silently
   * orphaning the socket bound to the first object, which then never
   * receives another broadcast again.
   */
  private hydrating = new Map<string, Promise<LiveRoom<TState, TSeat> | null>>();
  private socketBindings = new Map<string, SocketBinding<TSeat>>();
  private graceTimers = new Map<string, NodeJS.Timeout>();
  private sweepTimer: NodeJS.Timeout;
  private graceMs: number;
  private idleTimeoutMs: number;
  private idleTimeoutWithEmailsMs: number;
  private emailSender: EmailSender;
  private appBaseUrl?: string;

  constructor(
    private module: GameModule<TState, TConfig, TSeat>,
    private repository: RoomRepository<TState, TSeat>,
    private nsp: Namespace,
    options: RoomStoreOptions = {},
  ) {
    this.graceMs = options.graceMs ?? RECONNECT_GRACE_MS;
    this.idleTimeoutMs = options.idleTimeoutMs ?? IDLE_ROOM_TIMEOUT_MS;
    this.idleTimeoutWithEmailsMs = options.idleTimeoutWithEmailsMs ?? IDLE_ROOM_TIMEOUT_WITH_EMAILS_MS;
    this.emailSender = options.emailSender ?? createNoopEmailSender();
    this.appBaseUrl = options.appBaseUrl;
    this.sweepTimer = setInterval(
      () => this.sweepIdleRooms().catch((error) => console.error(`[roomStore:${this.module.id}] idle sweep failed:`, error)),
      options.idleSweepMs ?? IDLE_SWEEP_INTERVAL_MS,
    );
    this.sweepTimer.unref?.();
  }

  stop(): void {
    clearInterval(this.sweepTimer);
    for (const timer of this.graceTimers.values()) clearTimeout(timer);
    this.graceTimers.clear();
  }

  async createRoom(rawConfig: unknown): Promise<{ ok: true; roomCode: string } | { ok: false; error: { code: string; message: string } }> {
    const config = this.module.parseConfig(rawConfig);
    if (config === null) {
      return { ok: false, error: { code: 'INVALID_CONFIG', message: 'Invalid room configuration.' } };
    }

    let code = generateRoomCode();
    while (this.cache.has(code) || (await this.repository.get(code))) {
      code = generateRoomCode();
    }

    const now = Date.now();
    const seatOrder = this.module.seatsForConfig(config);
    const room: LiveRoom<TState, TSeat> = {
      code,
      gameState: this.module.createInitialState(config),
      seatOrder,
      seats: {},
      knownEmails: {},
      spectatorSocketIds: new Set(),
      createdAt: now,
      lastActivityAt: now,
    };
    this.cache.set(code, room);
    await this.persist(room);
    return { ok: true, roomCode: code };
  }

  async getRoom(code: string): Promise<LiveRoom<TState, TSeat> | null> {
    const cached = this.cache.get(code);
    if (cached) return cached;

    const inFlight = this.hydrating.get(code);
    if (inFlight) return inFlight;

    const promise = this.hydrateRoom(code).finally(() => this.hydrating.delete(code));
    this.hydrating.set(code, promise);
    return promise;
  }

  private async hydrateRoom(code: string): Promise<LiveRoom<TState, TSeat> | null> {
    const persisted = await this.repository.get(code);
    if (!persisted) return null;
    if (persisted.gameId !== this.module.id) return null; // belongs to a different game's namespace

    const now = Date.now();
    const seats: Partial<Record<TSeat, LiveSeat>> = {};
    // Backfilled from any still-present per-seat email, not just
    // persisted.knownEmails directly — a room saved before this field
    // existed still has its emails sitting on `seats[...].email`.
    const knownEmails: Partial<Record<TSeat, string>> = { ...persisted.knownEmails };
    for (const seat of persisted.seatOrder) {
      const persistedSeat = persisted.seats[seat];
      if (!persistedSeat) continue;
      seats[seat] = { seatToken: persistedSeat.seatToken, socketId: null, disconnectedAt: now, email: persistedSeat.email };
      if (persistedSeat.email) knownEmails[seat] = persistedSeat.email;
    }

    const hydrated: LiveRoom<TState, TSeat> = {
      code: persisted.code,
      gameState: persisted.gameState,
      seatOrder: persisted.seatOrder,
      seats,
      knownEmails,
      spectatorSocketIds: new Set(),
      createdAt: persisted.createdAt,
      lastActivityAt: persisted.lastActivityAt,
    };
    this.cache.set(code, hydrated);
    for (const seat of Object.keys(seats) as TSeat[]) {
      this.startGraceTimer(hydrated.code, seat);
    }
    return hydrated;
  }

  async joinRoom(code: string, role: Role<TSeat>, socketId: string, email?: string): Promise<JoinResult<TSeat, unknown>> {
    const room = await this.getRoom(code);
    if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };

    if (role === 'spectator') {
      room.spectatorSocketIds.add(socketId);
      this.socketBindings.set(socketId, { code, role: 'spectator' });
      this.broadcastRoomInfo(room);
      return { ok: true, gameState: this.viewFor(room, 'spectator'), you: { role: 'spectator' } };
    }

    if (!room.seatOrder.includes(role)) {
      return { ok: false, error: { code: 'SEAT_NOT_IN_GAME', message: `No such seat for this room.` } };
    }

    const seat = room.seats[role];
    if (seat && seat.disconnectedAt !== null) {
      return {
        ok: false,
        error: {
          code: 'SEAT_RECONNECTING',
          message: `${role} disconnected recently; reconnect with the original seat token instead.`,
        },
      };
    }
    if (seat) {
      return { ok: false, error: { code: 'SEAT_TAKEN', message: `${role} is already taken.` } };
    }

    const seatToken = nanoid(21);
    room.seats[role] = { seatToken, socketId, disconnectedAt: null, email };
    if (email) room.knownEmails[role] = email;
    this.socketBindings.set(socketId, { code, role });
    room.lastActivityAt = Date.now();
    await this.persist(room);
    this.broadcastRoomInfo(room);
    return { ok: true, seatToken, gameState: this.viewFor(room, role), you: { role } };
  }

  async reconnectRoom(code: string, role: TSeat, seatToken: string, socketId: string): Promise<JoinResult<TSeat, unknown>> {
    const room = await this.getRoom(code);
    if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };

    const seat = room.seats[role];
    if (!seat || seat.seatToken !== seatToken) {
      return { ok: false, error: { code: 'INVALID_TOKEN', message: 'Seat token does not match.' } };
    }

    this.clearGraceTimer(code, role);
    seat.socketId = socketId;
    seat.disconnectedAt = null;
    this.socketBindings.set(socketId, { code, role });
    room.lastActivityAt = Date.now();
    await this.persist(room);
    this.nsp.to(code).emit('seat_taken_over', { role });
    this.broadcastRoomInfo(room);
    return { ok: true, gameState: this.viewFor(room, role), you: { role } };
  }

  async leaveSeat(code: string, socketId: string): Promise<void> {
    const room = await this.getRoom(code);
    const binding = this.socketBindings.get(socketId);
    if (!room || !binding || binding.code !== code) return;

    if (binding.role === 'spectator') {
      room.spectatorSocketIds.delete(socketId);
    } else {
      this.clearGraceTimer(code, binding.role);
      delete room.seats[binding.role];
      await this.persist(room);
      this.nsp.to(code).emit('seat_freed', { role: binding.role });
    }
    this.socketBindings.delete(socketId);
    this.broadcastRoomInfo(room);
  }

  async handleDisconnect(socketId: string): Promise<void> {
    const binding = this.socketBindings.get(socketId);
    if (!binding) return;
    this.socketBindings.delete(socketId);

    const room = await this.getRoom(binding.code);
    if (!room) return;

    if (binding.role === 'spectator') {
      room.spectatorSocketIds.delete(socketId);
      this.broadcastRoomInfo(room);
      return;
    }

    const seat = room.seats[binding.role];
    if (!seat || seat.socketId !== socketId) return; // stale binding, already superseded
    seat.socketId = null;
    seat.disconnectedAt = Date.now();
    this.broadcastRoomInfo(room);
    this.startGraceTimer(binding.code, binding.role);
  }

  /**
   * Runs a game-engine mutation for whichever seat `socketId` is bound to.
   * The acting seat always comes from the socket→seat binding, never from
   * client-supplied data, so a player can never act as a different seat.
   */
  async applyAction(
    code: string,
    socketId: string,
    action: (state: TState, seat: TSeat) => EngineResult<TState, any>,
  ): Promise<ActionResult> {
    const room = await this.getRoom(code);
    if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };

    const binding = this.socketBindings.get(socketId);
    if (!binding || binding.code !== code || binding.role === 'spectator') {
      return { ok: false, error: { code: 'NOT_A_PLAYER', message: 'Only a seated player may act.' } };
    }

    const previousState = room.gameState;
    let result: EngineResult<TState, any>;
    try {
      result = action(room.gameState, binding.role);
    } catch (error) {
      // Defense in depth against a malformed-but-validation-passing payload
      // or an unforeseen engine bug — never let a thrown error from
      // untrusted client input crash the whole socket server.
      console.error(`[room ${code}] action threw unexpectedly:`, error);
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } };
    }
    if (!result.ok) return { ok: false, error: result.error };

    room.gameState = result.state;
    room.lastActivityAt = Date.now();
    await this.persist(room);
    this.broadcastState(room, result.data);
    this.notifyTurnIfOffline(room, previousState);
    return { ok: true };
  }

  /**
   * Async play: if this action just handed the turn to a seat that has no
   * live socket connected — comparing GameModule.getActiveSeat before vs.
   * after — and we've ever been given an email for that seat (knownEmails,
   * NOT seats[...].email — the live seat entry, and its email along with
   * it, is deleted once that seat's reconnect grace lapses, which happens
   * on essentially every turn in real async play; knownEmails is the
   * durable record that survives that), sends a "it's your turn"
   * notification. Fire-and-forget: never awaited, so a slow/broken email
   * API can't delay the acting player's own response. No dedup bookkeeping
   * needed — this only ever fires once per hand-off to a new active seat,
   * since the very next time it could fire again is if the turn changes to
   * someone (which can't happen while the current seat is still active).
   */
  private notifyTurnIfOffline(room: LiveRoom<TState, TSeat>, previousState: TState): void {
    if (!this.module.getActiveSeat) return;
    const before = this.module.getActiveSeat(previousState);
    const after = this.module.getActiveSeat(room.gameState);
    if (!after || after === before) return;

    if (room.seats[after]?.socketId) return; // currently connected — no need to notify
    const email = room.knownEmails[after];
    if (!email) return;

    // A live seat entry (and its token) may already be gone by now — its
    // own 2-minute reconnect grace lapsed before this later turn even came
    // back around, which is the normal case in real async play. The link
    // still works either way: with a token it reconnects straight back in,
    // without one the client just falls back to its own seat-picker lobby,
    // same as any other stale-token reconnect attempt (see useRoomConnection.ts).
    const seatToken = room.seats[after]?.seatToken;
    const path = this.module.roomUrlPath?.(room.code);
    const link =
      this.appBaseUrl && path
        ? `${this.appBaseUrl}${path}${seatToken ? `?seat=${encodeURIComponent(after)}&token=${encodeURIComponent(seatToken)}` : ''}`
        : null;
    const subject = `It's your turn in ${this.module.displayName}!`;
    const text = link
      ? `It's your turn in ${this.module.displayName} — room ${room.code}.\n\n${link}`
      : `It's your turn in ${this.module.displayName} — room ${room.code}.`;
    this.emailSender
      .send(email, subject, text)
      .catch((error) => console.error(`[roomStore:${this.module.id}] turn notification failed:`, error));
  }

  private viewFor(room: LiveRoom<TState, TSeat>, viewer: TSeat | 'spectator'): unknown {
    return this.module.toView ? this.module.toView(room.gameState, viewer) : room.gameState;
  }

  private broadcastState(room: LiveRoom<TState, TSeat>, data?: unknown): void {
    if (!this.module.toView) {
      this.nsp.to(room.code).emit('game_state', room.gameState);
    } else {
      for (const seat of room.seatOrder) {
        const s = room.seats[seat];
        if (s?.socketId) this.nsp.to(s.socketId).emit('game_state', this.module.toView(room.gameState, seat));
      }
      for (const specId of room.spectatorSocketIds) {
        this.nsp.to(specId).emit('game_state', this.module.toView(room.gameState, 'spectator'));
      }
    }

    this.module.afterMutation?.({
      state: room.gameState,
      seatOrder: room.seatOrder,
      data,
      emitToSeat: (seat, event, payload) => {
        const s = room.seats[seat];
        if (s?.socketId) this.nsp.to(s.socketId).emit(event as any, payload as any);
      },
      broadcastToRoom: (event, payload) => {
        this.nsp.to(room.code).emit(event as any, payload as any);
      },
    });
  }

  private buildRoomInfo(room: LiveRoom<TState, TSeat>): RoomInfo<TSeat> {
    const seats: Partial<Record<TSeat, { connected: boolean }>> = {};
    for (const seat of room.seatOrder) {
      const s = room.seats[seat];
      if (s) seats[seat] = { connected: s.socketId !== null };
    }
    return { code: room.code, seatOrder: [...room.seatOrder], seats, spectatorCount: room.spectatorSocketIds.size };
  }

  private broadcastRoomInfo(room: LiveRoom<TState, TSeat>): void {
    this.nsp.to(room.code).emit('room_update', this.buildRoomInfo(room));
  }

  /** Seeds a socket's own initial view right after it joins the io room (the broadcast above fires before that). */
  async getRoomInfo(code: string): Promise<RoomInfo<TSeat> | null> {
    const room = await this.getRoom(code);
    return room ? this.buildRoomInfo(room) : null;
  }

  private async persist(room: LiveRoom<TState, TSeat>): Promise<void> {
    const seats = {} as Partial<Record<TSeat, { seatToken: string; email?: string }>>;
    for (const seat of room.seatOrder) {
      const s = room.seats[seat];
      if (s) seats[seat] = { seatToken: s.seatToken, email: s.email };
    }
    const persisted: PersistedRoom<TState, TSeat> = {
      code: room.code,
      gameId: this.module.id,
      gameState: room.gameState,
      seatOrder: [...room.seatOrder],
      seats,
      knownEmails: { ...room.knownEmails },
      createdAt: room.createdAt,
      lastActivityAt: room.lastActivityAt,
    };
    await this.repository.save(persisted);
  }

  private startGraceTimer(code: string, role: TSeat): void {
    this.clearGraceTimer(code, role);
    const timer = setTimeout(
      () => this.expireSeat(code, role).catch((error) => console.error(`[roomStore:${this.module.id}] expireSeat failed for ${code}:${role}:`, error)),
      this.graceMs,
    );
    timer.unref?.();
    this.graceTimers.set(`${code}:${role}`, timer);
  }

  private clearGraceTimer(code: string, role: TSeat): void {
    const key = `${code}:${role}`;
    const timer = this.graceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(key);
    }
  }

  private async expireSeat(code: string, role: TSeat): Promise<void> {
    this.graceTimers.delete(`${code}:${role}`);
    const room = this.cache.get(code);
    if (!room) return;
    const seat = room.seats[role];
    if (!seat || seat.disconnectedAt === null) return; // reconnected in the meantime
    delete room.seats[role];
    await this.persist(room);
    this.nsp.to(code).emit('seat_freed', { role });
    this.broadcastRoomInfo(room);
  }

  /**
   * ANY seat (not necessarily every seat) ever supplying an email is enough
   * to read a room as a real async game rather than a hotseat test — e.g.
   * creating a room, supplying your own email, and messaging a friend to
   * join later: the friend hasn't joined yet (or might never bother typing
   * an email even once they do), but the room still shouldn't expire
   * before they get around to it. A hotseat room never collects an email
   * for any seat at all, so this still correctly excludes every one of
   * those — see IDLE_ROOM_TIMEOUT_WITH_EMAILS_MS.
   */
  private idleTimeoutFor(room: LiveRoom<TState, TSeat>): number {
    const anySeatHasEmail = Object.keys(room.knownEmails).length > 0;
    return anySeatHasEmail ? this.idleTimeoutWithEmailsMs : this.idleTimeoutMs;
  }

  private async sweepIdleRooms(): Promise<void> {
    const now = Date.now();
    for (const [code, room] of this.cache) {
      const hasOccupant = Object.keys(room.seats).length > 0 || room.spectatorSocketIds.size > 0;
      if (!hasOccupant && now - room.lastActivityAt > this.idleTimeoutFor(room)) {
        this.cache.delete(code);
        await this.repository.delete(code);
      }
    }
  }
}
