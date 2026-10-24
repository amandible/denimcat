import { getDb } from '../db/client';

/** Case/whitespace-insensitive everywhere emails are stored or looked up — a mismatch here would silently fail closed, the same bug class as the SITE_PASSWORD gate this replaces. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface AuthRepository {
  /** Atomic insert-if-absent. `isNew` (a row was actually inserted) is what triggers the owner notification — not a separate read-then-write, to avoid a race where two concurrent requests for the same brand-new email both think they're first. */
  getOrCreateAccount(email: string): Promise<{ email: string; isNew: boolean }>;
  /** How many magic-link tokens have been issued to this email within the last `windowMs` — the rate-limit check (see authService.MAX_LINKS_PER_HOUR). */
  countRecentMagicLinks(email: string, windowMs: number): Promise<number>;
  createMagicLink(email: string, token: string, expiresAt: number): Promise<void>;
  /** Atomic check-unused+check-unexpired+mark-used in one statement — a read-then-write couldn't actually enforce single-use under a race (e.g. an email client prefetching the link). Null covers "never issued," "expired," and "already used" alike — deliberately not distinguished, to avoid leaking which. */
  consumeMagicLink(token: string): Promise<{ email: string } | null>;
  createSession(email: string, token: string, expiresAt: number): Promise<void>;
  getSession(token: string): Promise<{ email: string } | null>;
  deleteSession(token: string): Promise<void>;
  /** Null means no account row (shouldn't normally happen post-sign-in) or no display name set yet — both render the same way client-side (fall back to empty). */
  getDisplayName(email: string): Promise<string | null>;
  setDisplayName(email: string, displayName: string): Promise<void>;
  /** Defaults to true (ships with no behavior change) — see the turn_chime_enabled column's NOT NULL DEFAULT true in db/client.ts. */
  getTurnChimeEnabled(email: string): Promise<boolean>;
  setTurnChimeEnabled(email: string, enabled: boolean): Promise<void>;
}

/** Used for tests and as the sole store when no DATABASE_URL is configured. */
export class InMemoryAuthRepository implements AuthRepository {
  private accounts = new Map<string, { displayName: string | null; turnChimeEnabled: boolean }>();
  private magicLinks = new Map<string, { email: string; expiresAt: number; usedAt: number | null; createdAt: number }>();
  private sessions = new Map<string, { email: string; expiresAt: number }>();

  async getOrCreateAccount(email: string): Promise<{ email: string; isNew: boolean }> {
    const normalized = normalizeEmail(email);
    if (this.accounts.has(normalized)) return { email: normalized, isNew: false };
    this.accounts.set(normalized, { displayName: null, turnChimeEnabled: true });
    return { email: normalized, isNew: true };
  }

  async getDisplayName(email: string): Promise<string | null> {
    return this.accounts.get(normalizeEmail(email))?.displayName ?? null;
  }

  async setDisplayName(email: string, displayName: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const existing = this.accounts.get(normalized) ?? { displayName: null, turnChimeEnabled: true };
    existing.displayName = displayName;
    this.accounts.set(normalized, existing);
  }

  async getTurnChimeEnabled(email: string): Promise<boolean> {
    return this.accounts.get(normalizeEmail(email))?.turnChimeEnabled ?? true;
  }

  async setTurnChimeEnabled(email: string, enabled: boolean): Promise<void> {
    const normalized = normalizeEmail(email);
    const existing = this.accounts.get(normalized) ?? { displayName: null, turnChimeEnabled: true };
    existing.turnChimeEnabled = enabled;
    this.accounts.set(normalized, existing);
  }

  async countRecentMagicLinks(email: string, windowMs: number): Promise<number> {
    const normalized = normalizeEmail(email);
    const since = Date.now() - windowMs;
    let count = 0;
    for (const link of this.magicLinks.values()) {
      if (link.email === normalized && link.createdAt >= since) count++;
    }
    return count;
  }

  async createMagicLink(email: string, token: string, expiresAt: number): Promise<void> {
    this.magicLinks.set(token, { email: normalizeEmail(email), expiresAt, usedAt: null, createdAt: Date.now() });
  }

  async consumeMagicLink(token: string): Promise<{ email: string } | null> {
    const link = this.magicLinks.get(token);
    if (!link || link.usedAt !== null || link.expiresAt <= Date.now()) return null;
    link.usedAt = Date.now();
    return { email: link.email };
  }

  async createSession(email: string, token: string, expiresAt: number): Promise<void> {
    this.sessions.set(token, { email: normalizeEmail(email), expiresAt });
  }

  async getSession(token: string): Promise<{ email: string } | null> {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) return null;
    return { email: session.email };
  }

  async deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }
}

/**
 * Same fail-soft philosophy as PostgresRoomRepository: a transient Neon
 * outage should never crash the socket server. Unlike room persistence
 * though, a write failure here (e.g. `createMagicLink`) means the visitor
 * silently never receives a usable link — there's no "next successful
 * write catches up" story for a one-shot auth request the way there is
 * for room state, but crashing the whole server over one failed signup
 * attempt would be worse. Logged either way so it's visible in practice.
 */
export class PostgresAuthRepository implements AuthRepository {
  async getOrCreateAccount(email: string): Promise<{ email: string; isNew: boolean }> {
    const normalized = normalizeEmail(email);
    const db = getDb();
    if (!db) return { email: normalized, isNew: false };
    try {
      const rows = await db<{ email: string }[]>`
        INSERT INTO accounts (email) VALUES (${normalized})
        ON CONFLICT (email) DO NOTHING
        RETURNING email
      `;
      return { email: normalized, isNew: rows.length > 0 };
    } catch (error) {
      console.error(`[db] failed to create/check account ${normalized}:`, error);
      return { email: normalized, isNew: false };
    }
  }

  async countRecentMagicLinks(email: string, windowMs: number): Promise<number> {
    const normalized = normalizeEmail(email);
    const db = getDb();
    if (!db) return 0;
    try {
      const rows = await db<{ count: number }[]>`
        SELECT count(*)::int AS count FROM magic_links
        WHERE email = ${normalized} AND created_at > now() - make_interval(secs => ${windowMs / 1000})
      `;
      return rows[0]?.count ?? 0;
    } catch (error) {
      console.error(`[db] failed to count recent magic links for ${normalized}:`, error);
      return 0;
    }
  }

  async createMagicLink(email: string, token: string, expiresAt: number): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      await db`
        INSERT INTO magic_links (token, email, expires_at)
        VALUES (${token}, ${normalizeEmail(email)}, to_timestamp(${expiresAt / 1000}))
      `;
    } catch (error) {
      console.error('[db] failed to create magic link:', error);
    }
  }

  async consumeMagicLink(token: string): Promise<{ email: string } | null> {
    const db = getDb();
    if (!db) return null;
    try {
      const rows = await db<{ email: string }[]>`
        UPDATE magic_links
        SET used_at = now()
        WHERE token = ${token} AND used_at IS NULL AND expires_at > now()
        RETURNING email
      `;
      return rows[0] ? { email: rows[0].email } : null;
    } catch (error) {
      console.error('[db] failed to consume magic link:', error);
      return null;
    }
  }

  async createSession(email: string, token: string, expiresAt: number): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      await db`
        INSERT INTO sessions (token, email, expires_at)
        VALUES (${token}, ${normalizeEmail(email)}, to_timestamp(${expiresAt / 1000}))
      `;
    } catch (error) {
      console.error('[db] failed to create session:', error);
    }
  }

  async getSession(token: string): Promise<{ email: string } | null> {
    const db = getDb();
    if (!db) return null;
    try {
      const rows = await db<{ email: string }[]>`
        SELECT email FROM sessions WHERE token = ${token} AND expires_at > now()
      `;
      return rows[0] ? { email: rows[0].email } : null;
    } catch (error) {
      console.error('[db] failed to read session:', error);
      return null;
    }
  }

  async deleteSession(token: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      await db`DELETE FROM sessions WHERE token = ${token}`;
    } catch (error) {
      console.error('[db] failed to delete session:', error);
    }
  }

  async getDisplayName(email: string): Promise<string | null> {
    const db = getDb();
    if (!db) return null;
    try {
      const rows = await db<{ display_name: string | null }[]>`
        SELECT display_name FROM accounts WHERE email = ${normalizeEmail(email)}
      `;
      return rows[0]?.display_name ?? null;
    } catch (error) {
      console.error('[db] failed to read display name:', error);
      return null;
    }
  }

  async setDisplayName(email: string, displayName: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      await db`
        UPDATE accounts SET display_name = ${displayName} WHERE email = ${normalizeEmail(email)}
      `;
    } catch (error) {
      console.error('[db] failed to set display name:', error);
    }
  }

  async getTurnChimeEnabled(email: string): Promise<boolean> {
    const db = getDb();
    if (!db) return true;
    try {
      const rows = await db<{ turn_chime_enabled: boolean }[]>`
        SELECT turn_chime_enabled FROM accounts WHERE email = ${normalizeEmail(email)}
      `;
      return rows[0]?.turn_chime_enabled ?? true;
    } catch (error) {
      console.error('[db] failed to read turn chime preference:', error);
      return true;
    }
  }

  async setTurnChimeEnabled(email: string, enabled: boolean): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      await db`
        UPDATE accounts SET turn_chime_enabled = ${enabled} WHERE email = ${normalizeEmail(email)}
      `;
    } catch (error) {
      console.error('[db] failed to set turn chime preference:', error);
    }
  }
}

/** Picks the Postgres-backed repository when Neon is configured, else an in-memory-only fallback. */
export function createDefaultAuthRepository(): AuthRepository {
  return getDb() ? new PostgresAuthRepository() : new InMemoryAuthRepository();
}
