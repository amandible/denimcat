import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type { GameState, LoveTrianglesConfig, SeatId } from '@denimcat/engine-love-triangles';
import { InMemoryRoomRepository, RoomStore, attachSocketHandlers } from '@denimcat/platform';
import { loveTrianglesModule } from '../src/games/love-triangles/module';

function emitAck<T>(socket: ClientSocket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, ...args, resolve);
  });
}

async function createRoom(socket: ClientSocket, config: LoveTrianglesConfig): Promise<string> {
  const result = await emitAck<{ ok: true; roomCode: string } | { ok: false; error: unknown }>(
    socket,
    'create_room',
    config,
  );
  if (!result.ok) throw new Error(`create_room failed: ${JSON.stringify(result.error)}`);
  return result.roomCode;
}

describe('Love Triangles room + game flow over real sockets', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let store: RoomStore<GameState, LoveTrianglesConfig, SeatId>;
  let baseUrl: string;
  let clients: ClientSocket[] = [];

  beforeEach(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    const nsp = io.of(loveTrianglesModule.namespace);
    store = new RoomStore(loveTrianglesModule, new InMemoryRoomRepository<GameState, SeatId>(), nsp, {
      graceMs: 150,
      idleSweepMs: 10_000,
    });
    attachSocketHandlers(nsp, store, loveTrianglesModule);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}${loveTrianglesModule.namespace}`;
  });

  afterEach(async () => {
    store.stop();
    for (const c of clients) c.close();
    clients = [];
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(): Promise<ClientSocket> {
    const socket = ioc(baseUrl, { transports: ['websocket'] });
    clients.push(socket);
    return new Promise((resolve) => socket.on('connect', () => resolve(socket)));
  }

  it('rejects an invalid player count at room creation', async () => {
    const socket = await connect();
    const result = await emitAck<any>(socket, 'create_room', { playerCount: 5 });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_CONFIG');
  });

  it('rejects joining a seat that does not exist for this room', async () => {
    const socket = await connect();
    const roomCode = await createRoom(socket, { playerCount: 2 });
    const result = await emitAck<any>(socket, 'join_room', { roomCode, role: 'p3' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SEAT_NOT_IN_GAME');
  });

  it('deals a full, public, no-hidden-info state visible identically to every viewer', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    const p1Join = await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    const p2Join = await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });

    expect(p1Join.ok).toBe(true);
    expect(p2Join.ok).toBe(true);
    expect(p1Join.gameState.players.p1.gems).toBe(9);
    expect(p1Join.gameState.players.p2.gems).toBe(10);
    expect(p1Join.gameState.topRow).toHaveLength(3);
    expect(p1Join.gameState.bottomRow).toHaveLength(3);
    expect(p1Join.gameState.activeSeat).toBe('p1');
  });

  it('plays a buy through to a state update, and broadcasts the event log to every socket in the room, not just the buyer', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const spectatorSocket = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    const p1Join = await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });
    await emitAck<any>(spectatorSocket, 'join_room', { roomCode, role: 'spectator' });

    const linkId = p1Join.gameState.topRow[0];

    const eventsReceived: Record<string, any[]> = {};
    for (const [name, socket] of [
      ['buyer', s1],
      ['other-player', s2],
      ['spectator', spectatorSocket],
    ] as const) {
      socket.on('love_triangles_events', (payload: any[]) => {
        eventsReceived[name] = payload;
      });
    }

    const buyResult = await emitAck<any>(s1, 'buy_link', { roomCode, linkId });
    expect(buyResult.ok).toBe(true);

    // Give the fire-and-forget broadcast a tick to land on every socket.
    await new Promise((r) => setTimeout(r, 20));

    for (const name of ['buyer', 'other-player', 'spectator']) {
      expect(eventsReceived[name], `${name} should have received an event log`).toBeDefined();
      expect(eventsReceived[name].map((e: any) => e.kind)).toContain('purchased');
    }
  });

  it('rejects malformed payloads cleanly instead of crashing, and the server stays usable afterward', async () => {
    const s1 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });

    const malformedPayloads: Array<[string, unknown]> = [
      ['buy_link', { roomCode, linkId: 'not-a-real-link' }],
      ['buy_link', { roomCode, linkId: 123 }],
      ['buy_link', {}], // missing roomCode
      ['pass', {}], // missing roomCode
    ];

    for (const [event, payload] of malformedPayloads) {
      const result = await emitAck<any>(s1, event, payload);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('INVALID_PAYLOAD');
    }

    const stillWorksCode = await createRoom(s1, { playerCount: 3 });
    expect(stillWorksCode).toHaveLength(4);
  });

  it('reconnects a dropped seat with its token, and rejects a bad token', async () => {
    const s1 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    const join = await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    expect(join.ok).toBe(true);
    const seatToken = join.seatToken as string;

    s1.close();
    await new Promise((r) => setTimeout(r, 30));

    const reconnectSocket = await connect();
    const reconnectResult = await emitAck<any>(reconnectSocket, 'reconnect_room', {
      roomCode,
      role: 'p1',
      seatToken,
    });
    expect(reconnectResult.ok).toBe(true);
    expect(reconnectResult.gameState.players.p1.gems).toBe(9);

    const badReconnectSocket = await connect();
    const badReconnect = await emitAck<any>(badReconnectSocket, 'reconnect_room', {
      roomCode,
      role: 'p1',
      seatToken: 'not-the-real-token',
    });
    expect(badReconnect.ok).toBe(false);
  });
});
