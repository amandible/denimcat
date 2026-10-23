import { Router } from 'express';
import cors from 'cors';
import type { AuthService, GameModule, RoomStore } from '@denimcat/platform';

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
        }));
      }),
    );

    // Your-turn games first, most recently active first within each group.
    const games = perGame
      .flat()
      .sort((a, b) => (a.isMyTurn === b.isMyTurn ? b.lastActivityAt - a.lastActivityAt : a.isMyTurn ? -1 : 1));

    res.json({ ok: true, games });
  });

  return router;
}
