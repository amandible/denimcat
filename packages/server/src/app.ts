import express from 'express';
import type { AuthService, SurveyRepository } from '@denimcat/platform';
import { authRouter } from './authRoutes';
import { myGamesRouter, type GameStoreEntry } from './myGamesRoutes';
import { surveyRouter } from './surveyRoutes';

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
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
