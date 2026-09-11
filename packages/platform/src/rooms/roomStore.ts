import { nanoid } from 'nanoid';
import type { Namespace } from 'socket.io';
import type { ActionResult, EngineResult, JoinResult, Role, RoomInfo } from '@denimcat/shared';
import type { GameModule } from '../gameModule';
import { generateRoomCode } from './roomCode';
import type { PersistedRoom, RoomRepository } from './roomRepository';

const RECONNECT_GRACE_MS = 2 * 60 * 1000;
const IDLE_SWEEP_INTERVAL_MS = 60 * 1000;
const IDLE_ROOM_TIMEOUT_MS = 30 * 60 * 1000;

interface LiveSeat {
  seatToken: string;
  socketId: string | null;
  disconnectedAt: number | null;
}

interface LiveRoom<TState, TSeat extends string> {
  code: string;
  gameState: TState;
  seatOrder: readonly TSeat[];
  seats: Partial<Record<TSeat, LiveSeat>>;
  spectatorSocketIds: Set<string>;
  createdAt: number;
  lastActivityAt: number;
}

type SocketBinding<TSeat extends string> = { code: string; role: Role<TSeat> };

export interface RoomStoreOptions {
  graceMs?: number;
  idleSweepMs?: number;
  idleTimeoutMs?: number;
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
  private socketBindings = new Map<string, SocketBinding<TSeat>>();
  private graceTimers = new Map<string, NodeJS.Timeout>();
  private sweepTimer: NodeJS.Timeout;
  private graceMs: number;
  private idleTimeoutMs: number;

  constructor(
    private module: GameModule<TState, TConfig, TSeat>,
    private repository: RoomRepository<TState, TSeat>,
    private nsp: Namespace,
    options: RoomStoreOptions = {},
  ) {
    this.graceMs = options.graceMs ?? RECONNECT_GRACE_MS;
    this.idleTimeoutMs = options.idleTimeoutMs ?? IDLE_ROOM_TIMEOUT_MS;
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

    const persisted = await this.repository.get(code);
    if (!persisted) return null;
    if (persisted.gameId !== this.module.id) return null; // belongs to a different game's namespace

    const now = Date.now();
    const seats: Partial<Record<TSeat, LiveSeat>> = {};
    for (const seat of persisted.seatOrder) {
      const persistedSeat = persisted.seats[seat];
      if (!persistedSeat) continue;
      seats[seat] = { seatToken: persistedSeat.seatToken, socketId: null, disconnectedAt: now };
    }

    const hydrated: LiveRoom<TState, TSeat> = {
      code: persisted.code,
      gameState: persisted.gameState,
      seatOrder: persisted.seatOrder,
      seats,
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

  async joinRoom(code: string, role: Role<TSeat>, socketId: string): Promise<JoinResult<TSeat, unknown>> {
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
    room.seats[role] = { seatToken, socketId, disconnectedAt: null };
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
    this.broadcastState(room);
    return { ok: true };
  }

  private viewFor(room: LiveRoom<TState, TSeat>, viewer: TSeat | 'spectator'): unknown {
    return this.module.toView ? this.module.toView(room.gameState, viewer) : room.gameState;
  }

  private broadcastState(room: LiveRoom<TState, TSeat>): void {
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
      emitToSeat: (seat, event, payload) => {
        const s = room.seats[seat];
        if (s?.socketId) this.nsp.to(s.socketId).emit(event as any, payload as any);
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
    const seats = {} as Partial<Record<TSeat, { seatToken: string }>>;
    for (const seat of room.seatOrder) {
      const s = room.seats[seat];
      if (s) seats[seat] = { seatToken: s.seatToken };
    }
    const persisted: PersistedRoom<TState, TSeat> = {
      code: room.code,
      gameId: this.module.id,
      gameState: room.gameState,
      seatOrder: [...room.seatOrder],
      seats,
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

  private async sweepIdleRooms(): Promise<void> {
    const now = Date.now();
    for (const [code, room] of this.cache) {
      const hasOccupant = Object.keys(room.seats).length > 0 || room.spectatorSocketIds.size > 0;
      if (!hasOccupant && now - room.lastActivityAt > this.idleTimeoutMs) {
        this.cache.delete(code);
        await this.repository.delete(code);
      }
    }
  }
}
