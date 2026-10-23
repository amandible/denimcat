import express from 'express';
import type { AuthService } from '@denimcat/platform';
import { authRouter } from './authRoutes';
import { myGamesRouter, type GameStoreEntry } from './myGamesRoutes';

export function createApp(deps: { authService: AuthService; clientOrigins: string[]; gameStores?: GameStoreEntry[] }) {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter(deps.authService, deps.clientOrigins));
  app.use('/my-games', myGamesRouter(deps.authService, deps.gameStores ?? [], deps.clientOrigins));
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
