import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type { GameState, MintConditionConfig, SeatId } from '@denimcat/engine-mint-condition';
import {
  InMemoryRoomRepository,
  InMemorySurveyRepository,
  RoomStore,
  attachSocketHandlers,
  createAuthService,
  InMemoryAuthRepository,
  type AuthService,
  type EmailSender,
} from '@denimcat/platform';
import { createApp } from '../src/app';
import type { GameStoreEntry } from '../src/myGamesRoutes';
import { mintConditionModule } from '../src/games/mint-condition/module';

function fakeEmailSender(): EmailSender & { calls: { to: string; subject: string; text: string }[] } {
  const calls: { to: string; subject: string; text: string }[] = [];
  return {
    calls,
    async send(to, subject, text) {
      calls.push({ to, subject, text });
    },
  };
}

function emitAck<T>(socket: ClientSocket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, ...args, resolve);
  });
}

describe('survey-responses routes', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let repository: InMemoryRoomRepository<GameState, SeatId>;
  let store: RoomStore<GameState, MintConditionConfig, SeatId>;
  let authService: AuthService;
  let surveyRepository: InMemorySurveyRepository;
  let sender: ReturnType<typeof fakeEmailSender>;
  let baseUrl: string;
  let nspUrl: string;
  let clients: ClientSocket[] = [];

  beforeEach(async () => {
    sender = fakeEmailSender();
    authService = createAuthService(new InMemoryAuthRepository(), sender, 'https://denimcat.example', 'owner@example.com');
    surveyRepository = new InMemorySurveyRepository();

    const gameStores: GameStoreEntry[] = [];
    const app = createApp({ authService, clientOrigins: [], gameStores, surveyRepository });
    httpServer = createServer(app);
    io = new Server(httpServer);

    io.of(/^\/.+$/).use(async (socket, next) => {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token) return next(new Error('unauthorized'));
      const session = await authService.checkSession(token);
      if (!session) return next(new Error('unauthorized'));
      socket.data.email = session.email;
      next();
    });

    repository = new InMemoryRoomRepository<GameState, SeatId>();
    const nsp = io.of(mintConditionModule.namespace);
    store = new RoomStore(mintConditionModule, repository, nsp, { graceMs: 150, idleSweepMs: 10_000 });
    attachSocketHandlers(nsp, store, mintConditionModule);
    gameStores.push({ module: mintConditionModule, store });

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
    nspUrl = `${baseUrl}${mintConditionModule.namespace}`;
  });

  afterEach(async () => {
    store.stop();
    for (const c of clients) c.close();
    clients = [];
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function signIn(email: string): Promise<string> {
    await authService.requestLink(email);
    const sent = sender.calls.find((c) => c.to === email && c.subject === 'Your denimcat sign-in link');
    const match = sent?.text.match(/token=([^\s]+)/);
    if (!match) throw new Error(`no sign-in link for ${email}`);
    const result = await authService.verifyToken(decodeURIComponent(match[1]));
    if (!result) throw new Error(`verify failed for ${email}`);
    return result.sessionToken;
  }

  function connect(sessionToken: string): Promise<ClientSocket> {
    const socket = ioc(nspUrl, { transports: ['websocket'], auth: { token: sessionToken } });
    clients.push(socket);
    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  /**
   * Flips `phase` to 'ended' in BOTH the repository (what a fresh getRoom
   * hydration would read) and the live cached room (what the survey route's
   * store.getRoom actually returns, since this room is already live from
   * the create_room/join_room calls above) — two different read paths, so
   * a test exercising the live one needs the live one updated too. Same
   * mismatch, same fix, as roomStore.test.ts's own finishRoom helper.
   */
  async function finishRoom(code: string): Promise<void> {
    const persisted = await repository.get(code);
    if (!persisted) throw new Error('room not persisted');
    await repository.save({ ...persisted, gameState: { ...persisted.gameState, phase: 'ended' } });
    const live = await store.getRoom(code);
    if (live) live.gameState = { ...live.gameState, phase: 'ended' };
  }

  function submitSurvey(token: string | undefined, body: unknown) {
    return fetch(`${baseUrl}/survey-responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  }

  function getSurveyResponses(token: string | undefined, gameId: string) {
    return fetch(`${baseUrl}/survey-responses/${gameId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then((r) => r.json());
  }

  describe('POST /survey-responses', () => {
    it('accepts answers from a seat the signed-in account actually holds, once the room is finished', async () => {
      const aliceToken = await signIn('alice@example.com');
      const aliceSocket = await connect(aliceToken);
      const created = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
      await emitAck(aliceSocket, 'join_room', { roomCode: created.roomCode, role: 'p1' });
      await finishRoom(created.roomCode);

      const result = await submitSurvey(aliceToken, {
        gameId: 'mint-condition',
        roomCode: created.roomCode,
        seat: 'p1',
        answers: [{ questionId: 'fun', answer: 'Yes!' }],
      });
      expect(result).toEqual({ ok: true });

      const stored = await surveyRepository.listForGame('mint-condition');
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ seat: 'p1', accountEmail: 'alice@example.com', questionId: 'fun', answer: 'Yes!', roomCode: created.roomCode });
    });

    it('rejects a room that is not yet finished', async () => {
      const aliceToken = await signIn('alice@example.com');
      const aliceSocket = await connect(aliceToken);
      const created = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
      await emitAck(aliceSocket, 'join_room', { roomCode: created.roomCode, role: 'p1' });

      const result = await submitSurvey(aliceToken, {
        gameId: 'mint-condition',
        roomCode: created.roomCode,
        seat: 'p1',
        answers: [{ questionId: 'fun', answer: 'x' }],
      });
      expect(result.ok).toBe(false);
    });

    it('rejects a seat the signed-in account does not hold', async () => {
      const aliceToken = await signIn('alice@example.com');
      const bobToken = await signIn('bob@example.com');
      const aliceSocket = await connect(aliceToken);
      const bobSocket = await connect(bobToken);
      const created = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
      await emitAck(aliceSocket, 'join_room', { roomCode: created.roomCode, role: 'p1' });
      await emitAck(bobSocket, 'join_room', { roomCode: created.roomCode, role: 'p2' });
      await finishRoom(created.roomCode);

      // bob tries to submit as p1, which he doesn't hold.
      const result = await submitSurvey(bobToken, {
        gameId: 'mint-condition',
        roomCode: created.roomCode,
        seat: 'p1',
        answers: [{ questionId: 'fun', answer: 'x' }],
      });
      expect(result.ok).toBe(false);
    });

    it('rejects an unknown questionId', async () => {
      const aliceToken = await signIn('alice@example.com');
      const aliceSocket = await connect(aliceToken);
      const created = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
      await emitAck(aliceSocket, 'join_room', { roomCode: created.roomCode, role: 'p1' });
      await finishRoom(created.roomCode);

      const result = await submitSurvey(aliceToken, {
        gameId: 'mint-condition',
        roomCode: created.roomCode,
        seat: 'p1',
        answers: [{ questionId: 'not-a-real-question', answer: 'x' }],
      });
      expect(result.ok).toBe(false);
    });

    it('rejects a missing/invalid session, and malformed payloads', async () => {
      const aliceToken = await signIn('alice@example.com');
      const aliceSocket = await connect(aliceToken);
      const created = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
      await emitAck(aliceSocket, 'join_room', { roomCode: created.roomCode, role: 'p1' });
      await finishRoom(created.roomCode);

      const base = { gameId: 'mint-condition', roomCode: created.roomCode, seat: 'p1' };
      expect((await submitSurvey(undefined, { ...base, answers: [{ questionId: 'fun', answer: 'x' }] })).ok).toBe(false);
      expect((await submitSurvey(aliceToken, { ...base, answers: [] })).ok).toBe(false); // empty answers
      expect((await submitSurvey(aliceToken, base)).ok).toBe(false); // missing answers entirely
    });

    it('resubmitting the same seat/question is a harmless no-op, not an error', async () => {
      const aliceToken = await signIn('alice@example.com');
      const aliceSocket = await connect(aliceToken);
      const created = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
      await emitAck(aliceSocket, 'join_room', { roomCode: created.roomCode, role: 'p1' });
      await finishRoom(created.roomCode);

      const base = { gameId: 'mint-condition', roomCode: created.roomCode, seat: 'p1' };
      expect(await submitSurvey(aliceToken, { ...base, answers: [{ questionId: 'fun', answer: 'first' }] })).toEqual({ ok: true });
      expect(await submitSurvey(aliceToken, { ...base, answers: [{ questionId: 'fun', answer: 'second' }] })).toEqual({ ok: true }); // still ok — a harmless no-op, not an error

      const stored = await surveyRepository.listForGame('mint-condition');
      expect(stored).toHaveLength(1);
      expect(stored[0].answer).toBe('first'); // first write wins
    });
  });

  describe('GET /survey-responses/:gameId', () => {
    it('returns every response for that game to the owner account', async () => {
      const ownerToken = await signIn('owner@example.com');
      const aliceToken = await signIn('alice@example.com');
      const aliceSocket = await connect(aliceToken);
      const created = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
      await emitAck(aliceSocket, 'join_room', { roomCode: created.roomCode, role: 'p1' });
      await finishRoom(created.roomCode);
      await submitSurvey(aliceToken, {
        gameId: 'mint-condition',
        roomCode: created.roomCode,
        seat: 'p1',
        answers: [{ questionId: 'fun', answer: 'Yes!' }],
      });

      const result = await getSurveyResponses(ownerToken, 'mint-condition');
      expect(result.ok).toBe(true);
      expect(result.responses).toHaveLength(1);
      expect(result.responses[0]).toMatchObject({ seat: 'p1', answer: 'Yes!' });
    });

    it('rejects a signed-in non-owner account', async () => {
      const aliceToken = await signIn('alice@example.com');
      const result = await getSurveyResponses(aliceToken, 'mint-condition');
      expect(result.ok).toBe(false);
    });

    it('rejects a missing/invalid session', async () => {
      expect((await getSurveyResponses(undefined, 'mint-condition')).ok).toBe(false);
      expect((await getSurveyResponses('garbage', 'mint-condition')).ok).toBe(false);
    });
  });
});
