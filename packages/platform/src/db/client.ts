import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

let sql: Sql | null | undefined; // undefined = not checked yet, null = disabled

/**
 * Returns a pooled Postgres connection to Neon, or null if DATABASE_URL
 * isn't set. Persistence is optional: without it, room state lives only in
 * the process's in-memory cache (fine for local dev, but a restart loses
 * every room). Shared across every game — one connection pool, one table.
 */
export function getDb(): Sql | null {
  if (sql !== undefined) return sql;
  const url = process.env.DATABASE_URL;
  sql = url ? postgres(url, { ssl: 'require', max: 5 }) : null;
  return sql;
}

export async function ensureSchema(): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}
