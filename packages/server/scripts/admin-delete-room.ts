/**
 * Admin escape hatch for deleting a room directly from Postgres, bypassing
 * RoomStore.abandonRoom's "every seat is mine or never joined" rule. Meant
 * for a room every player has already agreed is over (e.g. one stuck by a
 * now-fixed bug) but that the normal in-app "Abandon" button won't offer,
 * since someone else holds a seat in it.
 *
 * Usage: npx tsx scripts/admin-delete-room.ts <ROOM_CODE>
 *
 * Deletes straight from the `rooms` table, same end state as
 * RoomStore.abandonRoom's own repository.delete(code) — the room
 * disappears from every account's "Your games" list immediately, since
 * that list is read straight from Postgres (see RoomStore.listOpenRoomsForAccount).
 */
import 'dotenv/config';
import { getDb } from '@denimcat/platform';

async function main() {
  const code = process.argv[2];
  if (!code) {
    console.error('Usage: npx tsx scripts/admin-delete-room.ts <ROOM_CODE>');
    process.exit(1);
  }

  const db = getDb();
  if (!db) {
    console.error('DATABASE_URL is not set — nothing to delete against.');
    process.exit(1);
  }

  const rows = await db<{ data: unknown }[]>`SELECT data FROM rooms WHERE code = ${code}`;
  if (rows.length === 0) {
    console.log(`No room found with code ${code}.`);
    process.exit(0);
  }

  const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data as string) : rows[0].data;
  console.log(`Found room ${code}:`, JSON.stringify(data, null, 2).slice(0, 2000));

  await db`DELETE FROM rooms WHERE code = ${code}`;
  console.log(`Deleted room ${code}.`);
  await db.end();
}

main();
