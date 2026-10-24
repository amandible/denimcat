/**
 * Admin diagnostic: lists every row in the `accounts` table (email +
 * created_at), newest first. Useful for confirming whether a given
 * sign-up actually went through `AuthRepository.getOrCreateAccount` (the
 * path that triggers the new-account owner-notification email in
 * AuthService.requestLink) and when.
 *
 * Usage: npx tsx scripts/admin-list-accounts.ts
 */
import 'dotenv/config';
import { getDb } from '@denimcat/platform';

async function main() {
  const db = getDb();
  if (!db) {
    console.error('DATABASE_URL is not set — nothing to query against.');
    process.exit(1);
  }

  const rows = await db<{ email: string; created_at: Date }[]>`
    SELECT email, created_at FROM accounts ORDER BY created_at DESC
  `;
  for (const row of rows) {
    console.log(`${row.created_at.toISOString()}  ${row.email}`);
  }
  console.log(`\n${rows.length} account(s) total.`);
  await db.end();
}

main();
