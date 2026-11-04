#!/usr/bin/env node
/**
 * One-time (but safe to re-run) fix for rooms.data rows written before
 * 2026-11-04, when roomRepository.ts's save() manually JSON.stringify'd a
 * room before handing it to the `postgres` library — which then
 * serialized that string a *second* time for the jsonb parameter, leaving
 * every row as a jsonb STRING containing JSON text instead of a real
 * jsonb OBJECT (see roomRepository.ts's parsePersistedRoomData doc
 * comment). save() itself is fixed; this unwraps the rows that already
 * exist. Idempotent: a row already stored correctly is left untouched.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/migrate-room-data-encoding.js            # dry run (default)
 *   DATABASE_URL=... node scripts/migrate-room-data-encoding.js --apply    # actually migrate
 */
const postgres = require('postgres');

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const sql = postgres(url, { ssl: 'require', max: 1 });
  try {
    const affected = await sql`SELECT code FROM rooms WHERE jsonb_typeof(data) = 'string' ORDER BY code`;
    console.log(`${affected.length} row(s) currently double-encoded: ${affected.map((r) => r.code).join(', ') || '(none)'}`);

    if (affected.length === 0) {
      console.log('Nothing to do.');
      return;
    }
    if (!apply) {
      console.log('Dry run only — re-run with --apply to fix these rows.');
      return;
    }

    // One UPDATE, one implicit transaction: if any row's inner text isn't
    // valid JSON, the whole statement errors out and nothing is changed —
    // there's no partial-migration state to worry about.
    const updated = await sql`
      UPDATE rooms
      SET data = (data #>> '{}')::jsonb
      WHERE jsonb_typeof(data) = 'string'
      RETURNING code
    `;
    console.log(`Migrated ${updated.length} row(s): ${updated.map((r) => r.code).join(', ')}`);

    const remaining = await sql`SELECT count(*)::int AS n FROM rooms WHERE jsonb_typeof(data) = 'string'`;
    console.log(`Rows still double-encoded after migration: ${remaining[0].n}`);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
