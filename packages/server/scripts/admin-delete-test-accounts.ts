/**
 * Admin cleanup: deletes any account (plus its magic_links/sessions rows)
 * whose email ends in @example.com — the convention this codebase's own
 * ad-hoc browser/socket testing scripts use for throwaway accounts. Those
 * accounts land in the real Neon DB when testing is done against a local
 * dev server pointed at it (rather than the in-memory repository the
 * automated test suite uses), so they need manual cleanup afterward.
 *
 * Usage: npx tsx scripts/admin-delete-test-accounts.ts
 */
import 'dotenv/config';
import { getDb } from '@denimcat/platform';

async function main() {
  const db = getDb();
  if (!db) {
    console.error('DATABASE_URL is not set — nothing to delete against.');
    process.exit(1);
  }

  const accounts = await db<{ email: string }[]>`
    SELECT email FROM accounts WHERE email LIKE '%@example.com'
  `;
  if (accounts.length === 0) {
    console.log('No @example.com test accounts found.');
    await db.end();
    return;
  }

  for (const { email } of accounts) {
    const deletedLinks = await db`DELETE FROM magic_links WHERE email = ${email} RETURNING token`;
    const deletedSessions = await db`DELETE FROM sessions WHERE email = ${email} RETURNING token`;
    await db`DELETE FROM accounts WHERE email = ${email}`;
    console.log(`Deleted ${email} (${deletedLinks.length} magic link(s), ${deletedSessions.length} session(s)).`);
  }

  await db.end();
}

main();
