/**
 * Admin test helper: forces a room's gameState.phase to 'ended' (with a
 * placeholder winner) directly in Postgres, for manually verifying
 * post-game UI (e.g. RecapPanel) without having to play a real game to
 * completion. NOT a general cross-game tool — the phase/winner field
 * names are game-specific, so this only works for games that use this
 * exact shape (mint-condition, love-triangles). Adjust per game as needed.
 *
 * After the server picks this up (it only re-hydrates from Postgres once
 * a room drops out of its in-memory cache, or on restart), reload the
 * browser tab to see the change — a stale in-memory live room otherwise
 * keeps serving the old state regardless of what's in the database.
 *
 * Usage: npx tsx scripts/admin-finish-room.ts <ROOM_CODE> <WINNER_SEAT>
 */
import 'dotenv/config';
import { getDb } from '@denimcat/platform';

async function main() {
  const code = process.argv[2];
  const winnerSeat = process.argv[3];
  if (!code || !winnerSeat) {
    console.error('Usage: npx tsx scripts/admin-finish-room.ts <ROOM_CODE> <WINNER_SEAT>');
    process.exit(1);
  }

  const db = getDb();
  if (!db) {
    console.error('DATABASE_URL is not set — nothing to update against.');
    process.exit(1);
  }

  const rows = await db<{ data: unknown }[]>`SELECT data FROM rooms WHERE code = ${code}`;
  if (rows.length === 0) {
    console.log(`No room found with code ${code}.`);
    process.exit(0);
  }
  const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data as string) : rows[0].data;
  data.gameState.phase = 'ended';
  data.gameState.winner = [winnerSeat];

  await db`UPDATE rooms SET data = ${JSON.stringify(data)}::jsonb WHERE code = ${code}`;
  console.log(`Room ${code} marked ended, winner ${winnerSeat}.`);
  await db.end();
}

main();
