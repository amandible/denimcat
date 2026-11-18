import express from 'express';
import type { AuthService, SurveyRepository } from '@denimcat/platform';
import { authRouter } from './authRoutes';
import { myGamesRouter, type GameStoreEntry } from './myGamesRoutes';
import { surveyRouter } from './surveyRoutes';
import { jsonErrorHandler } from './asyncRoute';

export function createApp(deps: {
  authService: AuthService;
  clientOrigins: string[];
  gameStores?: GameStoreEntry[];
  surveyRepository?: SurveyRepository;
}) {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter(deps.authService, deps.clientOrigins));
  app.use('/my-games', myGamesRouter(deps.authService, deps.gameStores ?? [], deps.clientOrigins));
  if (deps.surveyRepository) {
    app.use('/survey-responses', surveyRouter(deps.authService, deps.gameStores ?? [], deps.surveyRepository, deps.clientOrigins));
  }
  // `games` lets a post-deploy check confirm every game actually got
  // registered (see scripts/smoke-test-server.js). Read at request time:
  // index.ts fills gameStores in after createApp returns.
  app.get('/health', (_req, res) => {
    res.json({ ok: true, games: (deps.gameStores ?? []).map((entry) => entry.module.id) });
  });
  app.use(jsonErrorHandler);
  return app;
}
