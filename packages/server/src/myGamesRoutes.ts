import { Router } from 'express';
import cors from 'cors';
import { isNonEmptyString, type AuthService, type GameModule, type RoomStore } from '@denimcat/platform';

export interface GameStoreEntry {
  module: GameModule<any, any, any>;
  store: RoomStore<any, any, any>;
}

function bearerToken(req: { headers: { authorization?: string } }): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);
  return token.length > 0 ? token : null;
}

/**
 * The landing page's "your games" list: every currently-open room, across
 * every game, where the signed-in account holds a seat. Mounted at
 * /my-games. Like /auth, always `200` with an `{ok}` body — a missing or
 * invalid session is an expected outcome (not signed in yet), not an
 * exceptional one.
 */
export function myGamesRouter(authService: AuthService, gameStores: GameStoreEntry[], clientOrigins: string[]): Router {
  const router = Router();
  router.use(cors({ origin: clientOrigins.length > 0 ? clientOrigins : '*' }));

  router.get('/', async (req, res) => {
    const token = bearerToken(req);
    if (!token) {
      res.json({ ok: false });
      return;
    }
    const session = await authService.checkSession(token);
    if (!session) {
      res.json({ ok: false });
      return;
    }

    const perGame = await Promise.all(
      gameStores.map(async ({ module, store }) => {
        const summaries = await store.listOpenRoomsForAccount(session.email);
        return summaries.map((summary) => ({
          gameId: summary.gameId,
          displayName: module.displayName,
          code: summary.code,
          roomUrlPath: module.roomUrlPath ? module.roomUrlPath(summary.code) : `/${module.id}/room/${summary.code}`,
          seatCount: summary.seatCount,
          mySeatCount: summary.mySeats.length,
          status: summary.status,
          lastActivityAt: summary.lastActivityAt,
          createdAt: summary.createdAt,
          abandonable: summary.abandonable,
          otherPlayerNames: summary.otherPlayerNames,
        }));
      }),
    );

    // Your-turn first, then recap (a result is waiting — the other genuinely
    // actionable state), then waiting; newest-created first within each group.
    const STATUS_PRIORITY: Record<'your-turn' | 'waiting' | 'recap', number> = { 'your-turn': 0, recap: 1, waiting: 2 };
    const games = perGame
      .flat()
      .sort((a, b) => (STATUS_PRIORITY[a.status] !== STATUS_PRIORITY[b.status] ? STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] : b.createdAt - a.createdAt));

    res.json({ ok: true, games });
  });

  router.post('/abandon', async (req, res) => {
    const token = bearerToken(req);
    const gameId = req.body?.gameId;
    const code = req.body?.code;
    if (!token || !isNonEmptyString(gameId) || !isNonEmptyString(code)) {
      res.json({ ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Malformed request.' } });
      return;
    }
    const session = await authService.checkSession(token);
    if (!session) {
      res.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Not signed in.' } });
      return;
    }
    const entry = gameStores.find((g) => g.module.id === gameId);
    if (!entry) {
      res.json({ ok: false, error: { code: 'UNKNOWN_GAME', message: 'No such game.' } });
      return;
    }
    const result = await entry.store.abandonRoom(code, session.email);
    res.json(result);
  });

  return router;
}
