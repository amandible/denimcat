import 'dotenv/config';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import {
  RoomStore,
  attachSocketHandlers,
  createAuthService,
  shouldExposeDevLinks,
  createDefaultAuthRepository,
  createDefaultEmailSender,
  createDefaultRoomRepository,
  createDefaultSurveyRepository,
  ensureSchema,
  type GameModule,
  type RoomStoreOptions,
} from '@denimcat/platform';
import { createApp } from './app';
import type { GameStoreEntry } from './myGamesRoutes';
import { hyperBloomModule } from '../../../private-games/other-games/server-hyperbloom/module';
import { mintConditionModule } from './games/mint-condition/module';
import { loveTrianglesModule } from './games/love-triangles/module';
import { tashKalarModule } from '../../../private-games/other-games/server-tashkalar/module';
import { kingsGateModule } from '../../../private-games/other-games/server-kingsgate/module';
import { detourModule } from './games/detour/module';

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
  const exposeDevLinks = shouldExposeDevLinks(process.env);
  if (emailSender.isNoop && process.env.NODE_ENV === 'production') {
    console.warn('[startup] WARNING: no email sender configured in production (RESEND_API_KEY/RESEND_FROM missing) — sign-in links and turn notifications will NOT be delivered.');
  }
  const authService = createAuthService(authRepository, emailSender, appBaseUrl, process.env.OWNER_EMAIL, { exposeDevLinks });

  // Populated below, after each game's RoomStore is constructed (which
  // itself needs `io`, which needs `httpServer`, which needs `app` — so
  // this can't be filled in before createApp runs). Safe to hand the array
  // reference to createApp now and push into it later: no HTTP request can
  // land before httpServer.listen() below, by which point every game has
  // been pushed.
  const gameStores: GameStoreEntry[] = [];
  const surveyRepository = createDefaultSurveyRepository();

  const app = createApp({ authService, clientOrigins, gameStores, surveyRepository });
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

  // Every game gets its own namespace, RoomStore, and repository (all
  // repositories share one `rooms` table, keyed by gameId). To add a game,
  // add one line here — see docs/adding-a-new-game.md.
  function registerGame<TState, TConfig, TSeat extends string>(module: GameModule<TState, TConfig, TSeat>): void {
    const nsp = io.of(module.namespace);
    const store = new RoomStore(module, createDefaultRoomRepository<TState, TSeat>(), nsp, roomStoreOptions);
    attachSocketHandlers(nsp, store, module);
    gameStores.push({ module, store });
  }

  registerGame(hyperBloomModule);
  registerGame(mintConditionModule);
  registerGame(loveTrianglesModule);
  registerGame(detourModule);
  registerGame(tashKalarModule);
  registerGame(kingsGateModule);

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
