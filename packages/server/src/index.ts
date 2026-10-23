import 'dotenv/config';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { Color, GameState as HyperBloomState } from '@denimcat/engine-hyperbloom';
import type {
  GameState as MintConditionState,
  MintConditionConfig,
  SeatId as MintConditionSeatId,
} from '@denimcat/engine-mint-condition';
import type {
  GameState as LoveTrianglesState,
  LoveTrianglesConfig,
  SeatId as LoveTrianglesSeatId,
} from '@denimcat/engine-love-triangles';
import type { Color as TashKalarSeatId, GameState as TashKalarState, TashKalarConfig } from '@denimcat/engine-tashkalar';
import type { Color as KingsGateSeatId, GameState as KingsGateState, KingsGateConfig } from '@denimcat/engine-kingsgate';
import {
  RoomStore,
  attachSocketHandlers,
  createAuthService,
  createDefaultAuthRepository,
  createDefaultEmailSender,
  createDefaultRoomRepository,
  ensureSchema,
  type RoomStoreOptions,
} from '@denimcat/platform';
import { createApp } from './app';
import type { GameStoreEntry } from './myGamesRoutes';
import { hyperBloomModule } from '../../../private-games/other-games/server-hyperbloom/module';
import { mintConditionModule } from './games/mint-condition/module';
import { loveTrianglesModule } from './games/love-triangles/module';
import { tashKalarModule } from '../../../private-games/other-games/server-tashkalar/module';
import { kingsGateModule } from '../../../private-games/other-games/server-kingsgate/module';

async function main() {
  await ensureSchema();

  // CLIENT_ORIGIN may be a single origin or a comma-separated list (e.g. a
  // vercel.app URL alongside a custom domain aliased to the same
  // deployment) — computed once and shared by Socket.io's CORS config and
  // the /auth HTTP routes' CORS config below, rather than deriving it twice.
  const clientOrigins =
    process.env.CLIENT_ORIGIN?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  // One shared EmailSender for both async-play turn notifications and
  // magic-link sign-in. Resend when RESEND_API_KEY/RESEND_FROM are set,
  // else a noop sender that just logs.
  const emailSender = createDefaultEmailSender();
  const appBaseUrl = process.env.APP_BASE_URL;

  const authRepository = createDefaultAuthRepository();
  const authService = createAuthService(authRepository, emailSender, appBaseUrl, process.env.OWNER_EMAIL);

  // Populated below, after each game's RoomStore is constructed (which
  // itself needs `io`, which needs `httpServer`, which needs `app` — so
  // this can't be filled in before createApp runs). Safe to hand the array
  // reference to createApp now and push into it later: no HTTP request can
  // land before httpServer.listen() below, by which point every game has
  // been pushed.
  const gameStores: GameStoreEntry[] = [];

  const app = createApp({ authService, clientOrigins, gameStores });
  const httpServer = createServer(app);
  // Untyped at the top level deliberately: this one Server hosts multiple
  // games, each with its own event contract on its own namespace (typed
  // strictly on the client side and within each game's own handler files).
  const io = new Server(httpServer, {
    cors: { origin: clientOrigins.length > 0 ? clientOrigins : '*' },
  });

  // Magic-link sign-in gate for every game namespace, registered via
  // Socket.io's "parent namespace" feature (io.of(regex)) rather than plain
  // io.use() — the latter is shorthand for io.of("/").use(...) and only
  // ever applies to the default namespace, which this server never uses
  // (every game connects via io.of('/hyperbloom') etc.), so it would
  // silently protect nothing. A regex parent namespace's middleware IS
  // inherited by every later plain-string namespace matching it
  // (ParentNamespace.createChild copies each registered fn onto the
  // child as it's created) — which is also why this must run BEFORE the
  // per-game io.of(...) calls below: inheritance only happens at the
  // moment a namespace is first created.
  io.of(/^\/.+$/).use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) {
      next(new Error('unauthorized'));
      return;
    }
    const session = await authService.checkSession(token);
    if (!session) {
      next(new Error('unauthorized'));
      return;
    }
    // Available to every game's socket handlers as the server-verified
    // identity (see roomHandlers.ts's accountEmailOf/accountDisplayNameOf)
    // — never trust a client-supplied email/name for this purpose, only
    // this, since it's what lets reconnect_by_account recognize a seat as
    // belonging to this account.
    socket.data.email = session.email;
    socket.data.displayName = session.displayName ?? undefined;
    next();
  });

  // Async play: shared base URL for every game's turn notifications (see
  // RoomStore.notifyTurnIfOffline).
  const roomStoreOptions: RoomStoreOptions = {
    emailSender,
    appBaseUrl,
  };

  const hyperBloomRepository = createDefaultRoomRepository<HyperBloomState, Color>();
  const hyperBloomNsp = io.of(hyperBloomModule.namespace);
  const hyperBloomStore = new RoomStore(hyperBloomModule, hyperBloomRepository, hyperBloomNsp, roomStoreOptions);
  attachSocketHandlers(hyperBloomNsp, hyperBloomStore, hyperBloomModule);
  gameStores.push({ module: hyperBloomModule, store: hyperBloomStore });

  const mintConditionRepository = createDefaultRoomRepository<MintConditionState, MintConditionSeatId>();
  const mintConditionNsp = io.of(mintConditionModule.namespace);
  const mintConditionStore = new RoomStore<MintConditionState, MintConditionConfig, MintConditionSeatId>(
    mintConditionModule,
    mintConditionRepository,
    mintConditionNsp,
    roomStoreOptions,
  );
  attachSocketHandlers(mintConditionNsp, mintConditionStore, mintConditionModule);
  gameStores.push({ module: mintConditionModule, store: mintConditionStore });

  const loveTrianglesRepository = createDefaultRoomRepository<LoveTrianglesState, LoveTrianglesSeatId>();
  const loveTrianglesNsp = io.of(loveTrianglesModule.namespace);
  const loveTrianglesStore = new RoomStore<LoveTrianglesState, LoveTrianglesConfig, LoveTrianglesSeatId>(
    loveTrianglesModule,
    loveTrianglesRepository,
    loveTrianglesNsp,
    roomStoreOptions,
  );
  attachSocketHandlers(loveTrianglesNsp, loveTrianglesStore, loveTrianglesModule);
  gameStores.push({ module: loveTrianglesModule, store: loveTrianglesStore });

  const tashKalarRepository = createDefaultRoomRepository<TashKalarState, TashKalarSeatId>();
  const tashKalarNsp = io.of(tashKalarModule.namespace);
  const tashKalarStore = new RoomStore<TashKalarState, TashKalarConfig, TashKalarSeatId>(
    tashKalarModule,
    tashKalarRepository,
    tashKalarNsp,
    roomStoreOptions,
  );
  attachSocketHandlers(tashKalarNsp, tashKalarStore, tashKalarModule);
  gameStores.push({ module: tashKalarModule, store: tashKalarStore });

  const kingsGateRepository = createDefaultRoomRepository<KingsGateState, KingsGateSeatId>();
  const kingsGateNsp = io.of(kingsGateModule.namespace);
  const kingsGateStore = new RoomStore<KingsGateState, KingsGateConfig, KingsGateSeatId>(
    kingsGateModule,
    kingsGateRepository,
    kingsGateNsp,
    roomStoreOptions,
  );
  attachSocketHandlers(kingsGateNsp, kingsGateStore, kingsGateModule);
  gameStores.push({ module: kingsGateModule, store: kingsGateStore });

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
