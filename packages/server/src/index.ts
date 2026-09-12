import 'dotenv/config';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { Color, GameState as HyperBloomState } from '@denimcat/engine-hyperbloom';
import type { GameState as MintConditionState, MintConditionConfig, SeatId } from '@denimcat/engine-mint-condition';
import { RoomStore, attachSocketHandlers, createDefaultRoomRepository, ensureSchema } from '@denimcat/platform';
import { createApp } from './app';
import { hyperBloomModule } from './games/hyperbloom/module';
import { mintConditionModule } from './games/mint-condition/module';

async function main() {
  await ensureSchema();

  const app = createApp();
  const httpServer = createServer(app);
  // Untyped at the top level deliberately: this one Server hosts multiple
  // games, each with its own event contract on its own namespace (typed
  // strictly on the client side and within each game's own handler files).
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN ?? '*' },
  });

  const hyperBloomRepository = createDefaultRoomRepository<HyperBloomState, Color>();
  const hyperBloomNsp = io.of(hyperBloomModule.namespace);
  const hyperBloomStore = new RoomStore(hyperBloomModule, hyperBloomRepository, hyperBloomNsp);
  attachSocketHandlers(hyperBloomNsp, hyperBloomStore, hyperBloomModule);

  const mintConditionRepository = createDefaultRoomRepository<MintConditionState, SeatId>();
  const mintConditionNsp = io.of(mintConditionModule.namespace);
  const mintConditionStore = new RoomStore<MintConditionState, MintConditionConfig, SeatId>(
    mintConditionModule,
    mintConditionRepository,
    mintConditionNsp,
  );
  attachSocketHandlers(mintConditionNsp, mintConditionStore, mintConditionModule);

  const port = Number(process.env.PORT ?? 4000);
  httpServer.listen(port, () => {
    const persistence = process.env.DATABASE_URL ? 'Neon (Postgres)' : 'in-memory only (no DATABASE_URL set)';
    console.log(`denimcat server listening on :${port} — persistence: ${persistence}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
