import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAuthService, InMemoryAuthRepository, InMemorySurveyRepository, type EmailSender } from '@denimcat/platform';
import { createApp } from '../src/app';
import type { GameStoreEntry } from '../src/myGamesRoutes';
import { mintConditionModule } from '../src/games/mint-condition/module';

const noopSender: EmailSender = { async send() {} };

/**
 * A route handler that rejects (e.g. a database error surfacing from the
 * room repository) must produce a JSON 500 — never hang the request, and
 * never become an unhandled rejection, which crashes the whole Node
 * process (Express 4 doesn't catch async handler errors itself).
 */
describe('HTTP routes when a store call throws', () => {
  let httpServer: ReturnType<typeof createServer>;
  let baseUrl: string;
  const sessionToken = 'session-token-1';

  beforeEach(async () => {
    const authRepository = new InMemoryAuthRepository();
    await authRepository.getOrCreateAccount('alice@example.com');
    await authRepository.createSession('alice@example.com', sessionToken, Date.now() + 60_000);
    const authService = createAuthService(authRepository, noopSender, 'https://denimcat.example', undefined);

    const failingStore = {
      abandonRoom: async () => {
        throw new Error('database unavailable');
      },
      getRoom: async () => {
        throw new Error('database unavailable');
      },
    };
    const gameStores = [{ module: mintConditionModule, store: failingStore }] as unknown as GameStoreEntry[];
    const app = createApp({ authService, clientOrigins: [], gameStores, surveyRepository: new InMemorySurveyRepository() });
    httpServer = createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    baseUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('POST /my-games/abandon answers with a JSON INTERNAL_ERROR instead of hanging', async () => {
    const res = await fetch(`${baseUrl}/my-games/abandon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ gameId: 'mint-condition', code: 'ABCD' }),
      signal: AbortSignal.timeout(2000),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
  });

  it('GET /survey-responses/:gameId/:roomCode/mine answers with a JSON INTERNAL_ERROR instead of hanging', async () => {
    const res = await fetch(`${baseUrl}/survey-responses/mint-condition/ABCD/mine`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      signal: AbortSignal.timeout(2000),
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
  });

  it('the server keeps serving afterwards', async () => {
    await fetch(`${baseUrl}/my-games/abandon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ gameId: 'mint-condition', code: 'ABCD' }),
      signal: AbortSignal.timeout(2000),
    }).catch(() => {});
    const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    expect((await health.json()).ok).toBe(true);
  });
});
