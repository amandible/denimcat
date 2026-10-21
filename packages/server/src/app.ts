import express from 'express';
import type { AuthService } from '@denimcat/platform';
import { authRouter } from './authRoutes';

export function createApp(deps: { authService: AuthService; clientOrigins: string[] }) {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter(deps.authService, deps.clientOrigins));
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
