import { Router } from 'express';
import cors from 'cors';
import { isNonEmptyString, type AuthService } from '@denimcat/platform';

function bearerToken(req: { headers: { authorization?: string } }): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);
  return token.length > 0 ? token : null;
}

/**
 * Magic-link sign-in routes, mounted at /auth. Every response is `200` with
 * an `{ok}` boolean body, even for "failure" cases (bad/expired/missing
 * token, rate-limited request) — these are expected outcomes of normal use,
 * not exceptional ones, and never need to be distinguished by an HTTP
 * status the caller would have to branch on.
 */
export function authRouter(authService: AuthService, clientOrigins: string[]): Router {
  const router = Router();
  router.use(cors({ origin: clientOrigins.length > 0 ? clientOrigins : '*' }));

  router.post('/request-link', async (req, res) => {
    const email = req.body?.email;
    if (isNonEmptyString(email)) {
      await authService.requestLink(email);
    }
    res.json({ ok: true });
  });

  router.post('/verify', async (req, res) => {
    const token = req.body?.token;
    if (!isNonEmptyString(token)) {
      res.json({ ok: false });
      return;
    }
    const result = await authService.verifyToken(token);
    res.json(result ? { ok: true, ...result } : { ok: false });
  });

  router.get('/session', async (req, res) => {
    const token = bearerToken(req);
    if (!token) {
      res.json({ ok: false });
      return;
    }
    const session = await authService.checkSession(token);
    res.json(session ? { ok: true, ...session } : { ok: false });
  });

  router.post('/sign-out', async (req, res) => {
    const token = bearerToken(req);
    if (token) await authService.signOut(token);
    res.json({ ok: true });
  });

  router.post('/profile', async (req, res) => {
    const token = bearerToken(req);
    const displayName = req.body?.displayName;
    const turnChimeEnabled = req.body?.turnChimeEnabled;
    if (!token || typeof displayName !== 'string' || typeof turnChimeEnabled !== 'boolean') {
      res.json({ ok: false });
      return;
    }
    const result = await authService.updateProfile(token, { displayName, turnChimeEnabled });
    res.json(result ? { ok: true, ...result } : { ok: false });
  });

  return router;
}
