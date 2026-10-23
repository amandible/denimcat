import type { ChatMessage } from '@denimcat/shared';
import { getDb } from '../db/client';

export interface PersistedSeat {
  seatToken: string;
  /** Optional, supplied at join time — used for async-play turn notifications (see RoomStore.applyAction). */
  email?: string;
  /** Optional, supplied at join time — a display label shown to other players for as long as this seat is occupied. */
  name?: string;
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
  /**
   * Every email a seat has EVER supplied for this room, keyed by seat — kept
   * separate from `seats[...].email` because a seat entry itself is deleted
   * once its reconnect grace period lapses (RoomStore.expireSeat), which
   * would otherwise silently erase the one piece of information async-play
   * notifications and the long-idle-timeout check both depend on, right
   * around the time a real async game needs it most (every time a player
   * goes offline between turns). Never cleared once set. Optional only for
   * backward compatibility with rooms persisted before this field existed —
   * RoomStore.hydrateRoom backfills it from `seats[...].email` on read.
   */
  knownEmails?: Partial<Record<TSeat, string>>;
  /**
   * Every signed-in account's email that has EVER held a seat, keyed by
   * seat — the server-verified counterpart to knownEmails (which is
   * client-supplied and purely a notification preference). Never cleared,
   * so it outlives a lapsed reconnect grace the same way knownEmails does;
   * see RoomStore.reconnectByAccount, which is what actually reads this.
   * Unlike knownEmails there's no legacy field to backfill from — this
   * simply starts empty for any room persisted before accounts existed.
   */
  knownAccounts?: Partial<Record<TSeat, string>>;
  /** Never cleared, bounded by RoomStore.MAX_CHAT_HISTORY. Optional only for backward compatibility with rooms persisted before this feature — RoomStore.hydrateRoom defaults it to []. */
  chatMessages?: ChatMessage[];
  createdAt: number;
  lastActivityAt: number;
}

export interface RoomRepository<TState, TSeat extends string> {
  get(code: string): Promise<PersistedRoom<TState, TSeat> | null>;
  save(room: PersistedRoom<TState, TSeat>): Promise<void>;
  delete(code: string): Promise<void>;
  /** Every room of this game where `email` holds (or has ever held) a seat — see RoomStore.listOpenRoomsForAccount, the landing page's "your games" list. */
  findByAccountEmail(gameId: string, email: string): Promise<PersistedRoom<TState, TSeat>[]>;
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

  async findByAccountEmail(gameId: string, email: string): Promise<PersistedRoom<TState, TSeat>[]> {
    return [...this.rooms.values()].filter(
      (room) => room.gameId === gameId && Object.values(room.knownAccounts ?? {}).includes(email),
    );
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

  async findByAccountEmail(gameId: string, email: string): Promise<PersistedRoom<TState, TSeat>[]> {
    const db = getDb();
    if (!db) return [];
    try {
      // `data` comes back from a real Neon connection as a jsonb SCALAR
      // STRING holding the JSON text, not a jsonb object — see
      // parsePersistedRoomData's doc comment for the same quirk on the
      // read side. `->>`/`jsonb_each_text` only work on a true jsonb
      // object, so unwrap that outer string layer first via a LATERAL
      // before applying any path lookup.
      const rows = await db<{ data: PersistedRoom<TState, TSeat> | string }[]>`
        SELECT r.data FROM rooms r,
        LATERAL (
          SELECT CASE WHEN jsonb_typeof(r.data) = 'string' THEN (r.data #>> '{}')::jsonb ELSE r.data END AS doc
        ) d
        WHERE d.doc->>'gameId' = ${gameId}
          AND EXISTS (
            SELECT 1 FROM jsonb_each_text(COALESCE(d.doc->'knownAccounts', '{}'::jsonb)) AS kv(seat, val)
            WHERE kv.val = ${email}
          )
      `;
      return rows.map((row) => parsePersistedRoomData(row.data));
    } catch (error) {
      console.error(`[db] failed to find rooms for account ${email}:`, error);
      return [];
    }
  }
}

/** Picks the Postgres-backed repository when Neon is configured, else an in-memory-only fallback. */
export function createDefaultRoomRepository<TState, TSeat extends string>(): RoomRepository<TState, TSeat> {
  return getDb() ? new PostgresRoomRepository<TState, TSeat>() : new InMemoryRoomRepository<TState, TSeat>();
}
