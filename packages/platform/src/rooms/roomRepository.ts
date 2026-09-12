import { getDb } from '../db/client';

export interface PersistedSeat {
  seatToken: string;
}

/**
 * `gameId` is what lets multiple games share one `rooms` table safely: a
 * room hydrated from a code that belongs to a different game is rejected
 * (see RoomStore.getRoom's cross-game guard) rather than deserialized into
 * the wrong game's state shape.
 */
export interface PersistedRoom<TState, TSeat extends string> {
  code: string;
  gameId: string;
  gameState: TState;
  /**
   * The room's fixed seat list, stored explicitly rather than reconstructed
   * from `seats`' keys — a JSON round-trip (e.g. through Postgres) drops
   * object keys whose value is `undefined`, which would silently lose any
   * currently-empty seat if the seat list were inferred that way instead.
   */
  seatOrder: TSeat[];
  seats: Partial<Record<TSeat, PersistedSeat>>;
  createdAt: number;
  lastActivityAt: number;
}

export interface RoomRepository<TState, TSeat extends string> {
  get(code: string): Promise<PersistedRoom<TState, TSeat> | null>;
  save(room: PersistedRoom<TState, TSeat>): Promise<void>;
  delete(code: string): Promise<void>;
}

/** Used for tests and as the sole store when no DATABASE_URL is configured. */
export class InMemoryRoomRepository<TState, TSeat extends string> implements RoomRepository<TState, TSeat> {
  private rooms = new Map<string, PersistedRoom<TState, TSeat>>();

  async get(code: string): Promise<PersistedRoom<TState, TSeat> | null> {
    return this.rooms.get(code) ?? null;
  }

  async save(room: PersistedRoom<TState, TSeat>): Promise<void> {
    this.rooms.set(room.code, room);
  }

  async delete(code: string): Promise<void> {
    this.rooms.delete(code);
  }
}

/**
 * The jsonb column comes back as a raw JSON string rather than an
 * auto-parsed object in practice (observed against a real Neon connection,
 * driver/environment dependent) — handle both shapes rather than assuming
 * one, so a future driver/config change on either side can't reintroduce
 * this as a silent crash.
 */
export function parsePersistedRoomData<TState, TSeat extends string>(
  raw: PersistedRoom<TState, TSeat> | string,
): PersistedRoom<TState, TSeat> {
  return typeof raw === 'string' ? (JSON.parse(raw) as PersistedRoom<TState, TSeat>) : raw;
}

/**
 * Stores each room as a single JSONB blob keyed by room code — there's no
 * querying need beyond "get room by code," so a normalized relational
 * schema would add complexity with no payoff for an ephemeral, no-login
 * site. Every method fails soft (logs and degrades) rather than throwing: a
 * transient Neon outage should never crash the socket server or an
 * in-progress game — it should just mean that snapshot isn't durably saved
 * yet, which the next successful write will catch up on.
 */
export class PostgresRoomRepository<TState, TSeat extends string> implements RoomRepository<TState, TSeat> {
  async get(code: string): Promise<PersistedRoom<TState, TSeat> | null> {
    const db = getDb();
    if (!db) return null;
    try {
      const rows = await db<{ data: PersistedRoom<TState, TSeat> | string }[]>`
        SELECT data FROM rooms WHERE code = ${code}
      `;
      const raw = rows[0]?.data;
      return raw == null ? null : parsePersistedRoomData(raw);
    } catch (error) {
      console.error(`[db] failed to read room ${code}:`, error);
      return null;
    }
  }

  async save(room: PersistedRoom<TState, TSeat>): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      await db`
        INSERT INTO rooms (code, data, created_at, last_activity_at)
        VALUES (${room.code}, ${JSON.stringify(room)}::jsonb, to_timestamp(${room.createdAt / 1000}), to_timestamp(${room.lastActivityAt / 1000}))
        ON CONFLICT (code) DO UPDATE
          SET data = EXCLUDED.data, last_activity_at = EXCLUDED.last_activity_at
      `;
    } catch (error) {
      console.error(`[db] failed to save room ${room.code}:`, error);
    }
  }

  async delete(code: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      await db`DELETE FROM rooms WHERE code = ${code}`;
    } catch (error) {
      console.error(`[db] failed to delete room ${code}:`, error);
    }
  }
}

/** Picks the Postgres-backed repository when Neon is configured, else an in-memory-only fallback. */
export function createDefaultRoomRepository<TState, TSeat extends string>(): RoomRepository<TState, TSeat> {
  return getDb() ? new PostgresRoomRepository<TState, TSeat>() : new InMemoryRoomRepository<TState, TSeat>();
}
