import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type { GameState, MintConditionConfig, SeatId } from '@denimcat/engine-mint-condition';
import {
  InMemoryRoomRepository,
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

describe('GET /my-games', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let repository: InMemoryRoomRepository<GameState, SeatId>;
  let store: RoomStore<GameState, MintConditionConfig, SeatId>;
  let authService: AuthService;
  let sender: ReturnType<typeof fakeEmailSender>;
  let baseUrl: string;
  let nspUrl: string;
  let clients: ClientSocket[] = [];

  beforeEach(async () => {
    sender = fakeEmailSender();
    authService = createAuthService(new InMemoryAuthRepository(), sender, 'https://denimcat.example', undefined);

    const gameStores: GameStoreEntry[] = [];
    const app = createApp({ authService, clientOrigins: [], gameStores });
    httpServer = createServer(app);
    io = new Server(httpServer);

    // Same auth-gate shape as production index.ts, scoped to every namespace.
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

  function myGames(sessionToken?: string) {
    return fetch(`${baseUrl}/my-games`, {
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
    }).then((r) => r.json());
  }

  function cancelGame(sessionToken: string | undefined, gameId: unknown, code: unknown) {
    return fetch(`${baseUrl}/my-games/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) },
      body: JSON.stringify({ gameId, code }),
    }).then((r) => r.json());
  }

  it('lists an open room with the right isMyTurn for each seat-holder, and {ok:false} without a session', async () => {
    const aliceToken = await signIn('alice@example.com');
    const bobToken = await signIn('bob@example.com');
    const aliceSocket = await connect(aliceToken);
    const bobSocket = await connect(bobToken);

    const created = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
    const roomCode = created.roomCode;
    await emitAck(aliceSocket, 'join_room', { roomCode, role: 'p1' });
    await emitAck(bobSocket, 'join_room', { roomCode, role: 'p2' });

    expect(await myGames()).toEqual({ ok: false });
    expect(await myGames('garbage')).toEqual({ ok: false });

    const aliceGames = await myGames(aliceToken);
    expect(aliceGames.ok).toBe(true);
    expect(aliceGames.games).toHaveLength(1);
    const aliceEntry = aliceGames.games[0];
    expect(aliceEntry).toMatchObject({ gameId: 'mint-condition', code: roomCode, displayName: 'Mint Condition', seatCount: 2, mySeatCount: 1 });
    // Auctions start active for the seat that just joined last — p1 acts first by construction, so alice (p1) is the one actionable turn 1.
    expect(aliceEntry.isMyTurn).toBe(true);

    const bobGames = await myGames(bobToken);
    expect(bobGames.games).toHaveLength(1);
    expect(bobGames.games[0].isMyTurn).toBe(false);

    // An account with no seats anywhere gets an empty (not missing) list.
    const carolToken = await signIn('carol@example.com');
    expect(await myGames(carolToken)).toEqual({ ok: true, games: [] });
  });

  it('drops a room from the list once GameModule.isRoomFinished is true for it', async () => {
    const aliceToken = await signIn('alice@example.com');
    const aliceSocket = await connect(aliceToken);
    const created = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
    const roomCode = created.roomCode;
    await emitAck(aliceSocket, 'join_room', { roomCode, role: 'p1' });

    expect((await myGames(aliceToken)).games).toHaveLength(1);

    const persisted = await repository.get(roomCode);
    if (!persisted) throw new Error('room not persisted');
    await repository.save({ ...persisted, gameState: { ...persisted.gameState, phase: 'ended' } });

    expect(await myGames(aliceToken)).toEqual({ ok: true, games: [] });
  });

  it('exposes createdAt and cancelable, and POST /my-games/cancel deletes a solo room but refuses a joined one', async () => {
    const aliceToken = await signIn('alice@example.com');
    const bobToken = await signIn('bob@example.com');
    const aliceSocket = await connect(aliceToken);

    const soloRoom = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
    await emitAck(aliceSocket, 'join_room', { roomCode: soloRoom.roomCode, role: 'p1' });

    const aliceGames = await myGames(aliceToken);
    const soloEntry = aliceGames.games.find((g: any) => g.code === soloRoom.roomCode);
    expect(soloEntry.cancelable).toBe(true);
    expect(typeof soloEntry.createdAt).toBe('number');

    // Missing/invalid session, and malformed payloads.
    expect(await cancelGame(undefined, 'mint-condition', soloRoom.roomCode)).toMatchObject({ ok: false });
    expect(await cancelGame(aliceToken, undefined, soloRoom.roomCode)).toMatchObject({ ok: false });

    const cancelled = await cancelGame(aliceToken, 'mint-condition', soloRoom.roomCode);
    expect(cancelled).toEqual({ ok: true });
    expect((await myGames(aliceToken)).games).toHaveLength(0);

    // A room someone else has joined can't be cancelled out from under them.
    const sharedRoom = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
    await emitAck(aliceSocket, 'join_room', { roomCode: sharedRoom.roomCode, role: 'p1' });
    const bobSocket = await connect(bobToken);
    await emitAck(bobSocket, 'join_room', { roomCode: sharedRoom.roomCode, role: 'p2' });

    const refused = await cancelGame(aliceToken, 'mint-condition', sharedRoom.roomCode);
    expect(refused).toEqual({ ok: false, error: { code: 'NOT_CANCELABLE', message: expect.any(String) } });
    expect((await myGames(aliceToken)).games.some((g: any) => g.code === sharedRoom.roomCode)).toBe(true);
  });

  it('sorts your-turn games first, newest-created first within each group, and includes other players\' names', async () => {
    const aliceToken = await signIn('alice@example.com');
    const bobToken = await signIn('bob@example.com');
    const aliceSocket = await connect(aliceToken);
    const bobSocket = await connect(bobToken);

    // createdAt has millisecond resolution — a tiny delay between each
    // "older"/"newer" pair guarantees they actually land in different
    // milliseconds, so the sort-order assertion below isn't a coin flip.
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

    // Bob opens (p1), so it's not alice's turn in either "waiting" room.
    const waitingOlder = await emitAck<{ ok: true; roomCode: string }>(bobSocket, 'create_room', { playerCount: 2 });
    await emitAck(bobSocket, 'join_room', { roomCode: waitingOlder.roomCode, role: 'p1' });
    await emitAck(aliceSocket, 'join_room', { roomCode: waitingOlder.roomCode, role: 'p2' });

    await tick();
    const waitingNewer = await emitAck<{ ok: true; roomCode: string }>(bobSocket, 'create_room', { playerCount: 2 });
    await emitAck(bobSocket, 'join_room', { roomCode: waitingNewer.roomCode, role: 'p1' });
    await emitAck(aliceSocket, 'join_room', { roomCode: waitingNewer.roomCode, role: 'p2' });

    // Alice opens (p1), so it's her turn in both of these.
    const turnOlder = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
    await emitAck(aliceSocket, 'join_room', { roomCode: turnOlder.roomCode, role: 'p1' });

    await tick();
    const turnNewer = await emitAck<{ ok: true; roomCode: string }>(aliceSocket, 'create_room', { playerCount: 2 });
    await emitAck(aliceSocket, 'join_room', { roomCode: turnNewer.roomCode, role: 'p1' });
    await emitAck(bobSocket, 'join_room', { roomCode: turnNewer.roomCode, role: 'p2', name: 'Bob' });

    const games = (await myGames(aliceToken)).games;
    expect(games.map((g: any) => g.code)).toEqual([turnNewer.roomCode, turnOlder.roomCode, waitingNewer.roomCode, waitingOlder.roomCode]);

    const turnNewerEntry = games.find((g: any) => g.code === turnNewer.roomCode);
    expect(turnNewerEntry.otherPlayerNames).toEqual(['Bob']);
    const turnOlderEntry = games.find((g: any) => g.code === turnOlder.roomCode);
    expect(turnOlderEntry.otherPlayerNames).toEqual([]); // p2 never joined
  });
});
