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
  // Magic-link sign-in (see auth/authRepository.ts). `accounts` is a ledger
  // (written the first time an email is ever seen — not a pre-approval
  // gate, since signup is open) rather than something to collapse into
  // `magic_links`/`sessions`: those two have incompatible lifetimes
  // (single-use ~20min vs. reusable ~30 days), so keeping all three
  // separate avoids an awkward polymorphic `kind` column.
  await db`
    CREATE TABLE IF NOT EXISTS accounts (
      email TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Idempotent and additive like the CREATE TABLEs above, just via ALTER
  // instead — `ADD COLUMN IF NOT EXISTS` is safe to run against a table
  // that was already created before this column existed, unlike the
  // no-op-against-an-existing-table CREATE TABLE IF NOT EXISTS pattern.
  await db`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS display_name TEXT`;
  // NOT NULL DEFAULT true (rather than nullable like display_name) means
  // every row — existing and new — already reads as "on" with no app-level
  // null-coalescing needed: the whole point is this preference ships with
  // no behavior change for anyone.
  await db`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS turn_chime_enabled BOOLEAN NOT NULL DEFAULT true`;
  await db`
    CREATE TABLE IF NOT EXISTS magic_links (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Independent of `rooms` — a response must outlive its room being
  // deleted and support "every answer ever given for this game" across
  // rooms, which a per-room JSONB blob can't (see surveys/surveyRepository.ts's
  // own doc comment). room_id, not room_code, is the uniqueness/identity
  // key — room codes get reused once a room is deleted.
  await db`
    CREATE TABLE IF NOT EXISTS survey_responses (
      id SERIAL PRIMARY KEY,
      game_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      room_code TEXT NOT NULL,
      seat TEXT NOT NULL,
      account_email TEXT NOT NULL,
      question_id TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (room_id, seat, question_id)
    )
  `;
  // See SurveyResponse's own doc comments for why these are captured as
  // plain text at submission time rather than resolved later from the
  // seat id — nullable since rows written before this column existed have
  // neither (surveyRepository.ts's Postgres listForGame falls back to the
  // raw seat id for positionLabel in that case, and leaves playerName
  // undefined, same as a response that was never given a name).
  await db`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS position_label TEXT`;
  await db`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS player_name TEXT`;
  // When an account last viewed a game's playtest notes (see NotesView) —
  // compared against survey_responses.created_at to decide whether a game
  // has unread feedback. One row per (email, game_id); upserted on every
  // view, never on submit.
  await db`
    CREATE TABLE IF NOT EXISTS feedback_read_at (
      email TEXT NOT NULL,
      game_id TEXT NOT NULL,
      read_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (email, game_id)
    )
  `;
}
