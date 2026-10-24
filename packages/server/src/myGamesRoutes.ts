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
          isMyTurn: summary.isMyTurn,
          lastActivityAt: summary.lastActivityAt,
          createdAt: summary.createdAt,
          cancelable: summary.cancelable,
          otherPlayerNames: summary.otherPlayerNames,
        }));
      }),
    );

    // Your-turn games first, most recently created first within each group.
    const games = perGame.flat().sort((a, b) => (a.isMyTurn === b.isMyTurn ? b.createdAt - a.createdAt : a.isMyTurn ? -1 : 1));

    res.json({ ok: true, games });
  });

  router.post('/cancel', async (req, res) => {
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
    const result = await entry.store.cancelRoom(code, session.email);
    res.json(result);
  });

  return router;
}
