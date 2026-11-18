import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAuthService, InMemoryAuthRepository } from '@denimcat/platform';
import { createApp } from '../src/app';
import type { GameStoreEntry } from '../src/myGamesRoutes';
import { mintConditionModule } from '../src/games/mint-condition/module';
import { detourModule } from '../src/games/detour/module';

describe('GET /health', () => {
  let httpServer: ReturnType<typeof createServer>;

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('lists every registered game id, so a deploy check can confirm none went missing', async () => {
    const authService = createAuthService(new InMemoryAuthRepository(), { async send() {} }, undefined, undefined);
    const gameStores = [{ module: mintConditionModule }, { module: detourModule }] as unknown as GameStoreEntry[];
    httpServer = createServer(createApp({ authService, clientOrigins: [], gameStores }));
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const res = await fetch(`http://localhost:${(httpServer.address() as AddressInfo).port}/health`);
    expect(await res.json()).toEqual({ ok: true, games: ['mint-condition', 'detour'] });
  });
});
