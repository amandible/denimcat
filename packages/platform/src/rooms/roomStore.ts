import { nanoid } from 'nanoid';
import type { Namespace } from 'socket.io';
import type { ActionResult, ChatMessage, EngineResult, JoinResult, Role, RoomInfo } from '@denimcat/shared';
import { createNoopEmailSender, type EmailSender } from '../email';
import type { GameModule } from '../gameModule';
import { generateRoomCode } from './roomCode';
import type { PersistedRoom, RoomRepository } from './roomRepository';

const RECONNECT_GRACE_MS = 2 * 60 * 1000;
const IDLE_SWEEP_INTERVAL_MS = 60 * 1000;
/**
 * Only ever applies to a room isPermanentlyExemptFromSweep doesn't already
 * cover — a never-claimed room (nobody, not even the creator, ever
 * actually joined a seat), or a finished-and-fully-viewed one with nothing
 * left for anyone to come back for. A room genuinely still in progress or
 * awaiting a slow-to-join invite is exempt outright, regardless of this
 * timeout — see isPermanentlyExemptFromSweep's doc comment, which is what
 * replaced this timeout's own former long/short tiering keyed on known
 * emails (removed once every real join became account-authenticated,
 * making that distinction redundant with the stronger exemption check).
 */
const IDLE_ROOM_TIMEOUT_MS = 30 * 60 * 1000;
/** Oldest messages drop once a room's chat exceeds this, bounding the per-room JSONB blob for long-running async games. */
const MAX_CHAT_HISTORY = 200;

interface LiveSeat {
  seatToken: string;
  socketId: string | null;
  disconnectedAt: number | null;
  /** Optional, supplied at join time — see RoomStoreOptions.emailSender's doc comment for what it's used for. */
  email?: string;
  /** Optional, supplied at join time — a display label shown to other players (via buildRoomInfo) for as long as this seat stays occupied. Never validated for uniqueness. */
  name?: string;
}

interface LiveRoom<TState, TSeat extends string> {
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

type SocketBinding<TSeat extends string> = { code: string; role: Role<TSeat> };

export interface RoomStoreOptions {
  graceMs?: number;
  idleSweepMs?: number;
  idleTimeoutMs?: number;
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
      roomId: nanoid(),
      gameState: this.module.createInitialState(config),
      seatOrder,
      seats: {},
      knownEmails: {},
      knownAccounts: {},
      knownNames: {},
      chatMessages: [],
      recapViewedBy: {},
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
    const knownAccounts: Partial<Record<TSeat, string>> = { ...persisted.knownAccounts };
    const knownNames: Partial<Record<TSeat, string>> = { ...persisted.knownNames };
    for (const seat of persisted.seatOrder) {
      const persistedSeat = persisted.seats[seat];
      if (!persistedSeat) continue;
      seats[seat] = { seatToken: persistedSeat.seatToken, socketId: null, disconnectedAt: now, email: persistedSeat.email, name: persistedSeat.name };
      if (persistedSeat.email) knownEmails[seat] = persistedSeat.email;
      if (persistedSeat.name) knownNames[seat] = persistedSeat.name;
    }

    const hydrated: LiveRoom<TState, TSeat> = {
      code: persisted.code,
      // A room persisted before this field existed never had the chance to
      // collect a survey_responses row keyed by it yet, so minting a fresh
      // one on first load is harmless — see PersistedRoom.roomId's doc comment.
      roomId: persisted.roomId ?? nanoid(),
      gameState: persisted.gameState,
      seatOrder: persisted.seatOrder,
      seats,
      knownEmails,
      knownAccounts,
      knownNames,
      chatMessages: persisted.chatMessages ?? [],
      recapViewedBy: { ...persisted.recapViewedBy },
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

  async joinRoom(
    code: string,
    role: Role<TSeat>,
    socketId: string,
    email?: string,
    name?: string,
    accountEmail?: string,
  ): Promise<JoinResult<TSeat, unknown>> {
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
    // The live record can be gone (expired after the ordinary reconnect
    // grace) while the seat is still genuinely owned — knownAccounts is the
    // durable record of who actually claimed it, and that claim survives a
    // lapsed connection. Without this check, a brand-new visitor's plain
    // join_room would indistinguishably look like the seat was never
    // joined, silently taking over the real owner's identity (and whatever
    // moves they'd already made) the moment their tab happened to be
    // closed for a couple of minutes. The real owner isn't locked out by
    // this — accountEmail matching knownAccounts[role] still passes through.
    const existingOwner = room.knownAccounts[role];
    if (existingOwner && existingOwner !== accountEmail) {
      return { ok: false, error: { code: 'SEAT_TAKEN', message: `${role} is already taken.` } };
    }

    const seatToken = nanoid(21);
    room.seats[role] = { seatToken, socketId, disconnectedAt: null, email, name };
    if (email) room.knownEmails[role] = email;
    if (name) room.knownNames[role] = name;
    if (accountEmail) room.knownAccounts[role] = accountEmail;
    // An account arriving into an already-finished room has, by definition,
    // just seen it — see PersistedRoom.recapViewedBy's doc comment. Rare in
    // practice for a fresh join (seats are normally all filled before a
    // game ends), but harmless and correct if it happens.
    if (accountEmail && this.module.isRoomFinished?.(room.gameState)) room.recapViewedBy[accountEmail] = true;
    this.socketBindings.set(socketId, { code, role });
    room.lastActivityAt = Date.now();
    await this.persist(room);
    this.broadcastRoomInfo(room);
    return { ok: true, seatToken, gameState: this.viewFor(room, role), you: { role } };
  }

  async reconnectRoom(
    code: string,
    role: TSeat,
    seatToken: string,
    socketId: string,
    accountEmail?: string,
  ): Promise<JoinResult<TSeat, unknown>> {
    const room = await this.getRoom(code);
    if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };

    const seat = room.seats[role];
    if (!seat || seat.seatToken !== seatToken) {
      return { ok: false, error: { code: 'INVALID_TOKEN', message: 'Seat token does not match.' } };
    }

    this.clearGraceTimer(code, role);
    seat.socketId = socketId;
    seat.disconnectedAt = null;
    // Backfills knownAccounts for a seat that predates this feature, or was
    // last (re)joined before this browser's account was known — the very
    // next account-based reconnect attempt (any device) then just works.
    // Never overwrites an existing DIFFERENT account: a seat token lives in
    // browser-scoped localStorage, not account-scoped storage, so a second
    // account signed in on the same browser could otherwise present this
    // seat's stored token and silently reassign ownership away from the
    // account that actually holds it.
    if (accountEmail && !room.knownAccounts[role]) room.knownAccounts[role] = accountEmail;
    // See joinRoom's identical comment — this account has just seen the
    // room's current state, which is "finished" here.
    if (accountEmail && this.module.isRoomFinished?.(room.gameState)) room.recapViewedBy[accountEmail] = true;
    this.socketBindings.set(socketId, { code, role });
    room.lastActivityAt = Date.now();
    await this.persist(room);
    this.nsp.to(code).emit('seat_taken_over', { role });
    this.broadcastRoomInfo(room);
    return { ok: true, gameState: this.viewFor(room, role), you: { role } };
  }

  /**
   * Tried by a browser with no locally-stored seat token for this room
   * (see roomHandlers.ts's reconnect_by_account): finds whichever seat
   * `accountEmail` has ever held (knownAccounts, which — unlike the live
   * `seats` map — survives a lapsed reconnect grace) and reclaims it,
   * either by taking over a still-live seat (identical semantics to
   * reconnectRoom's own unconditional takeover — same precedent, just
   * reached via account identity instead of a possessed token) or, if the
   * seat's live record already expired, rejoining fresh against the same
   * underlying game state (seat state lives in `gameState`, keyed by seat
   * id, untouched by a seat's own live-record expiry). `fallbackName` is
   * only used in that second case, to avoid a seat silently going nameless
   * once its original LiveSeat.name is gone (no lobby screen is shown to
   * ask again — this whole path is silent-by-design).
   */
  async reconnectByAccount(
    code: string,
    accountEmail: string,
    socketId: string,
    fallbackName?: string,
  ): Promise<JoinResult<TSeat, unknown>> {
    const room = await this.getRoom(code);
    if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };

    const role = room.seatOrder.find((seat) => room.knownAccounts[seat] === accountEmail);
    if (!role) {
      return { ok: false, error: { code: 'NO_OWNED_SEAT', message: 'No seat in this room is associated with your account.' } };
    }

    // See joinRoom's identical comment — this account has just seen the
    // room's current state, which is "finished" here. Applies to both
    // branches below (live takeover and fresh-rejoin alike).
    if (this.module.isRoomFinished?.(room.gameState)) room.recapViewedBy[accountEmail] = true;

    const existing = room.seats[role];
    if (existing) {
      this.clearGraceTimer(code, role);
      existing.socketId = socketId;
      existing.disconnectedAt = null;
      this.socketBindings.set(socketId, { code, role });
      room.lastActivityAt = Date.now();
      await this.persist(room);
      this.nsp.to(code).emit('seat_taken_over', { role });
      this.broadcastRoomInfo(room);
      return { ok: true, seatToken: existing.seatToken, gameState: this.viewFor(room, role), you: { role } };
    }

    const seatToken = nanoid(21);
    const email = room.knownEmails[role]; // carry forward whatever notify preference this seat last had
    room.seats[role] = { seatToken, socketId, disconnectedAt: null, email, name: fallbackName };
    if (fallbackName) room.knownNames[role] = fallbackName;
    this.socketBindings.set(socketId, { code, role });
    room.lastActivityAt = Date.now();
    await this.persist(room);
    this.broadcastRoomInfo(room);
    return { ok: true, seatToken, gameState: this.viewFor(room, role), you: { role } };
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
    this.broadcastState(room, result.data);
    this.notifyTurn(room, previousState);
    // notifyGameEnd mutates room.recapViewedBy directly — persist must run
    // after it (and after notifyTurn, which mutates nothing but is fine
    // either way), so that mutation is actually saved rather than living
    // only in memory until some later action re-persists the room, which
    // may never happen for a room that just finished.
    this.notifyGameEnd(room, previousState);
    await this.persist(room);
    return { ok: true };
  }

  /**
   * If this action just handed the turn to a seat we've ever been given an
   * email for (comparing GameModule.getActiveSeat before vs. after),
   * sends a "it's your turn" notification — unconditionally, regardless of
   * whether that seat currently has a live, foregrounded connection.
   * Deliberately not trying to guess whether the tab is actively watched:
   * confirmed with the designer that supplying an email at all is already
   * a strong, deliberate signal (players who sit down for a live game just
   * don't enter one; async players do), so a connected-and-watching seat
   * getting a redundant email once in a while is an acceptable, low-cost
   * tradeoff against the staleness/complexity of trying to track presence
   * (this replaced an earlier "away" tab-visibility heuristic — see git
   * history if that's ever worth resurrecting). Uses knownEmails, NOT
   * seats[...].email — the live seat entry, and its email along with it,
   * is deleted once that seat's reconnect grace lapses, which happens on
   * essentially every turn in real async play; knownEmails is the durable
   * record that survives that. Fire-and-forget: never awaited, so a slow/
   * broken email API can't delay the acting player's own response. No
   * dedup bookkeeping needed — this only ever fires once per hand-off to a
   * new active seat, since the very next time it could fire again is if
   * the turn changes to someone (which can't happen while the current seat
   * is still active).
   */
  private notifyTurn(room: LiveRoom<TState, TSeat>, previousState: TState): void {
    if (!this.module.getActiveSeat) return;
    const before = this.module.getActiveSeat(previousState);
    const after = this.module.getActiveSeat(room.gameState);
    if (!after || after === before) return;

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

  /**
   * Fires once, the instant a room transitions from not-finished to
   * finished (comparing GameModule.isRoomFinished before vs. after, same
   * diff-the-transition shape as notifyTurn above). Two things happen:
   *
   * 1. Every seat with a live, connected socket right now is marked as
   *    having viewed the recap — anyone watching the game conclude live
   *    has, by definition, already seen it. Everyone else (the real
   *    async-play case this whole feature exists for) is left for the
   *    join/reconnect backfill in joinRoom/reconnectRoom/reconnectByAccount
   *    to mark on their next arrival instead.
   * 2. Every seat with a knownEmails entry gets a "game over" email, same
   *    fire-and-forget convention as notifyTurn.
   */
  private notifyGameEnd(room: LiveRoom<TState, TSeat>, previousState: TState): void {
    if (!this.module.isRoomFinished) return;
    if (this.module.isRoomFinished(previousState) || !this.module.isRoomFinished(room.gameState)) return;

    for (const seat of room.seatOrder) {
      const liveSeat = room.seats[seat];
      const account = room.knownAccounts[seat];
      if (liveSeat?.socketId && account) room.recapViewedBy[account] = true;
    }

    for (const seat of room.seatOrder) {
      const email = room.knownEmails[seat];
      if (!email) continue;
      const subject = `Game over in ${this.module.displayName} — see how it ended`;
      const path = this.module.roomUrlPath?.(room.code);
      const seatToken = room.seats[seat]?.seatToken;
      const link =
        this.appBaseUrl && path
          ? `${this.appBaseUrl}${path}${seatToken ? `?seat=${encodeURIComponent(seat)}&token=${encodeURIComponent(seatToken)}` : ''}`
          : null;
      const text = link
        ? `Game over in ${this.module.displayName} — room ${room.code}. See how it ended:\n\n${link}`
        : `Game over in ${this.module.displayName} — room ${room.code}.`;
      this.emailSender
        .send(email, subject, text)
        .catch((error) => console.error(`[roomStore:${this.module.id}] game-end notification failed:`, error));
    }
  }

  private viewFor(room: LiveRoom<TState, TSeat>, viewer: TSeat | 'spectator'): unknown {
    return this.module.toView ? this.module.toView(room.gameState, viewer) : room.gameState;
  }

  /**
   * Re-runs afterMutation (and resends game_state) against the CURRENT
   * state, independent of any actual mutation — called by roomHandlers.ts
   * right after a join/reconnect socket has joined its Socket.IO room, so a
   * game whose afterMutation pushes a targeted per-viewer hint derived from
   * current state (e.g. Hyper Bloom's legal_moves, computed from whoever
   * `getActiveSeat` says is active) gets it resynced on arrival too — not
   * just after the next mutation. Without this, a player reconnecting
   * mid-turn would see a stale/empty hint (no legal moves highlighted)
   * until *something* happened to trigger a fresh mutation, which is
   * exactly the "can't move until I click undo" bug this fixes: clicking
   * undo was the first mutation to come along and finally repopulate it.
   * Must run only after the caller's socket has already called
   * `socket.join(roomCode)` — broadcastState's non-toView branch targets
   * the whole Socket.IO room, which would otherwise miss a socket that
   * hasn't joined it yet.
   */
  async resyncAfterJoin(code: string): Promise<void> {
    const room = await this.getRoom(code);
    if (room) this.broadcastState(room);
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

  /**
   * A seat belongs in here once it's EVER been claimed (knownAccounts), not
   * just while its live connection record exists — otherwise a seat whose
   * owner stepped away for a couple of minutes looks, to the lobby and to
   * every other viewer, exactly like one nobody has ever joined. `claimed`
   * carries that durable fact; `connected` is still the separate, ordinary
   * live/away signal. `name` prefers the live record (freshest) but falls
   * back to knownNames so it doesn't blink out the moment someone
   * disconnects. A seat with neither a live record nor a known account is
   * genuinely open — no entry at all, same as before.
   */
  private buildRoomInfo(room: LiveRoom<TState, TSeat>): RoomInfo<TSeat> {
    const seats: Partial<Record<TSeat, { claimed: boolean; connected: boolean; name?: string }>> = {};
    for (const seat of room.seatOrder) {
      const live = room.seats[seat];
      const claimed = !!room.knownAccounts[seat];
      if (!live && !claimed) continue;
      seats[seat] = { claimed, connected: live?.socketId != null, name: live?.name ?? room.knownNames[seat] };
    }
    return {
      code: room.code,
      seatOrder: [...room.seatOrder],
      seats,
      spectatorCount: room.spectatorSocketIds.size,
      chatMessages: room.chatMessages,
    };
  }

  private broadcastRoomInfo(room: LiveRoom<TState, TSeat>): void {
    this.nsp.to(room.code).emit('room_update', this.buildRoomInfo(room));
  }

  /** Seeds a socket's own initial view right after it joins the io room (the broadcast above fires before that). */
  async getRoomInfo(code: string): Promise<RoomInfo<TSeat> | null> {
    const room = await this.getRoom(code);
    return room ? this.buildRoomInfo(room) : null;
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
    const rooms = await this.repository.findByAccountEmail(this.module.id, email);
    const out: OpenGameSummary<TSeat>[] = [];
    for (const room of rooms) {
      const isFinished = this.module.isRoomFinished?.(room.gameState) ?? false;
      if (isFinished && room.recapViewedBy?.[email]) continue; // seen it — same as the old unconditional skip, now gated on having actually looked
      const mySeats = room.seatOrder.filter((seat) => room.knownAccounts?.[seat] === email);
      const activeSeat = this.module.getActiveSeat?.(room.gameState) ?? null;
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
        gameId: this.module.id,
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
    for (const seat of room.seatOrder) this.clearGraceTimer(code, seat);
    this.nsp.to(code).emit('room_closed', { reason: 'abandoned' });
    this.cache.delete(code);
    await this.repository.delete(code);
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
  async sendChatMessage(
    code: string,
    socketId: string,
    text: string,
    afterLogIndex: number,
    senderName?: string,
  ): Promise<ActionResult> {
    const room = await this.getRoom(code);
    if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } };
    const binding = this.socketBindings.get(socketId);
    if (!binding || binding.code !== code) {
      return { ok: false, error: { code: 'NOT_IN_ROOM', message: 'Not connected to this room.' } };
    }
    const message: ChatMessage = {
      id: nanoid(8),
      seat: binding.role,
      name: senderName,
      text,
      at: Date.now(),
      afterLogIndex,
    };
    room.chatMessages.push(message);
    if (room.chatMessages.length > MAX_CHAT_HISTORY) room.chatMessages.shift();
    room.lastActivityAt = Date.now();
    await this.persist(room);
    this.broadcastRoomInfo(room);
    return { ok: true };
  }

  private async persist(room: LiveRoom<TState, TSeat>): Promise<void> {
    const seats = {} as Partial<Record<TSeat, { seatToken: string; email?: string; name?: string }>>;
    for (const seat of room.seatOrder) {
      const s = room.seats[seat];
      if (s) seats[seat] = { seatToken: s.seatToken, email: s.email, name: s.name };
    }
    const persisted: PersistedRoom<TState, TSeat> = {
      code: room.code,
      roomId: room.roomId,
      gameId: this.module.id,
      gameState: room.gameState,
      seatOrder: [...room.seatOrder],
      seats,
      knownEmails: { ...room.knownEmails },
      knownAccounts: { ...room.knownAccounts },
      knownNames: { ...room.knownNames },
      chatMessages: [...room.chatMessages],
      recapViewedBy: { ...room.recapViewedBy },
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
    const isFinished = this.module.isRoomFinished?.(room.gameState) ?? false;
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
    if (!this.module.isRoomFinished?.(room.gameState)) return true;
    const accounts = new Set(Object.values(room.knownAccounts).filter((email): email is string => !!email));
    for (const email of accounts) {
      if (!room.recapViewedBy[email]) return false;
    }
    return true;
  }

  private async sweepIdleRooms(): Promise<void> {
    const now = Date.now();
    for (const [code, room] of this.cache) {
      // A live, currently-connected seat always implies knownAccounts is
      // already set for it (every join is account-authenticated — see
      // hasEverBeenClaimed), so checking seats here too would be redundant;
      // an active spectator has no durable claim at all, so it still needs
      // its own check.
      const hasActiveSpectator = room.spectatorSocketIds.size > 0;
      if (
        !hasActiveSpectator &&
        !this.isPermanentlyExemptFromSweep(room) &&
        now - room.lastActivityAt > this.idleTimeoutMs &&
        this.recapFullyViewed(room)
      ) {
        this.cache.delete(code);
        await this.repository.delete(code);
      }
    }
  }
}
