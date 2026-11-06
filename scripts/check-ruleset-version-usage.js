#!/usr/bin/env node
/**
 * Read-only check for whether any persisted room still references a
 * given game's ruleset version — the "is it safe to delete this
 * version's code yet" step in docs/guides/game-rule-versions.md's
 * obsoletion workflow. Never writes anything; same direct-Postgres-query
 * style as scripts/migrate-room-data-encoding.js.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/check-ruleset-version-usage.js <gameId> <versionId> [--include-undefined]
 *
 * --include-undefined also counts rooms with no rulesetVersion field at
 * all as matching — only meaningful when <versionId> is the OLDEST
 * surviving version, since an absent field means "this game's first
 * version" (see PersistedRoom.rulesetVersion's doc comment), not
 * "whatever's current now."
 */
const postgres = require('postgres');

function printHelp() {
  console.log(`Usage: DATABASE_URL=... node scripts/check-ruleset-version-usage.js <gameId> <versionId> [--include-undefined]

Lists every room still persisted with the given game's ruleset version,
so you can confirm it's safe to delete that version's code (see
docs/guides/game-rule-versions.md). Read-only.

Arguments:
  <gameId>      GameModule.id, e.g. "mint-condition"
  <versionId>   e.g. "v1" or "v2"

Options:
  --include-undefined   Also count rooms with no rulesetVersion field at
                         all (only meaningful for the OLDEST version).
  --help                Show this message.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const [gameId, versionId] = args.filter((a) => !a.startsWith('-'));
  const includeUndefined = args.includes('--include-undefined');
  if (!gameId || !versionId) {
    console.error('Missing required arguments.\n');
    printHelp();
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const sql = postgres(url, { ssl: 'require', max: 1 });
  try {
    const rows = includeUndefined
      ? await sql`
          SELECT code FROM rooms
          WHERE data ->> 'gameId' = ${gameId}
            AND (data ->> 'rulesetVersion' = ${versionId} OR data ->> 'rulesetVersion' IS NULL)
          ORDER BY code
        `
      : await sql`
          SELECT code FROM rooms
          WHERE data ->> 'gameId' = ${gameId}
            AND data ->> 'rulesetVersion' = ${versionId}
          ORDER BY code
        `;

    console.log(`${rows.length} room(s) of "${gameId}" still on ruleset version "${versionId}"${includeUndefined ? ' (including unset)' : ''}:`);
    console.log(rows.map((r) => r.code).join(', ') || '(none)');
    console.log(rows.length === 0 ? 'Safe to remove this version\'s code.' : 'NOT safe to remove yet — rooms above still reference it.');
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error) => {
  console.error('Check failed:', error);
  process.exit(1);
});
