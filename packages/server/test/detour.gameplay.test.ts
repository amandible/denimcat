import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type { DetourConfig, GameState, SeatId } from '@denimcat/engine-detour';
import { InMemoryRoomRepository, RoomStore, attachSocketHandlers } from '@denimcat/platform';
import { detourModule } from '../src/games/detour/module';

function emitAck<T>(socket: ClientSocket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, ...args, resolve);
  });
}

async function createRoom(socket: ClientSocket, config: DetourConfig): Promise<string> {
  const result = await emitAck<{ ok: true; roomCode: string } | { ok: false; error: unknown }>(
    socket,
    'create_room',
    config,
  );
  if (!result.ok) throw new Error(`create_room failed: ${JSON.stringify(result.error)}`);
  return result.roomCode;
}

/** The lowest-valued cell not currently occupied by the pawn — always a legal (if not necessarily wild-free) target. */
function anyLegalTarget(gameState: any, value: number): string {
  const entries = Object.entries(gameState.cells) as [string, { value: number; owner: string }][];
  const lowerTarget = entries.find(([cellId, cell]) => cellId !== gameState.pawnCell && cell.value < value);
  if (lowerTarget) return lowerTarget[0];
  // No lower target exists for this value - the wild rule applies; any non-pawn cell works.
  const anyNonPawn = entries.find(([cellId]) => cellId !== gameState.pawnCell)!;
  return anyNonPawn[0];
}

describe('Detour room + game flow over real sockets', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let store: RoomStore<GameState, DetourConfig, SeatId>;
  let baseUrl: string;
  let clients: ClientSocket[] = [];

  beforeEach(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    const nsp = io.of(detourModule.namespace);
    store = new RoomStore(detourModule, new InMemoryRoomRepository<GameState, SeatId>(), nsp, {
      graceMs: 150,
      idleSweepMs: 10_000,
    });
    attachSocketHandlers(nsp, store, detourModule);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}${detourModule.namespace}`;
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

  it('creates a room and deals seats their hands and a deck id', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    const p1Join = await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    const p2Join = await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });

    expect(p1Join.ok).toBe(true);
    expect(p2Join.ok).toBe(true);
    expect(p1Join.gameState.players.p1.hand).toHaveLength(3);
    expect(['A', 'B', 'C', 'D']).toContain(p1Join.gameState.players.p1.deckId);
    expect(['A', 'B', 'C', 'D']).toContain(p2Join.gameState.players.p2.deckId);
    expect(p1Join.gameState.players.p1.deckId).not.toBe(p1Join.gameState.players.p2.deckId);
  });

  it('rejects a play from the wrong seat, with an illegal target, or with a card not in hand', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    const p1Join = await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });

    expect(p1Join.gameState.activeSeat).toBe('p1');
    const myCard = p1Join.gameState.players.p1.hand[0];
    const legalTarget = anyLegalTarget(p1Join.gameState, myCard);

    const wrongSeat = await emitAck<any>(s2, 'play_card', { roomCode, value: myCard, target: legalTarget });
    expect(wrongSeat.ok).toBe(false);

    const notInHand = await emitAck<any>(s1, 'play_card', { roomCode, value: 999, target: legalTarget });
    expect(notInHand.ok).toBe(false);

    const illegalTarget = await emitAck<any>(s1, 'play_card', { roomCode, value: myCard, target: p1Join.gameState.pawnCell });
    expect(illegalTarget.ok).toBe(false);
  });

  it('rejects a well-formed-looking but nonexistent cell id as a malformed payload, before it ever reaches the engine', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    const p1Join = await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });
    const myCard = p1Join.gameState.players.p1.hand[0];

    // "0-4" and "3-0" look like valid "row-col" cell ids but name the two
    // corners the board doesn't actually have.
    const topRight = await emitAck<any>(s1, 'play_card', { roomCode, value: myCard, target: '0-4' });
    expect(topRight).toEqual({ ok: false, error: { code: 'INVALID_PAYLOAD', message: expect.any(String) } });

    const bottomLeft = await emitAck<any>(s1, 'play_card', { roomCode, value: myCard, target: '3-0' });
    expect(bottomLeft).toEqual({ ok: false, error: { code: 'INVALID_PAYLOAD', message: expect.any(String) } });
  });

  it('a legal play broadcasts the updated board and advances to the next seat', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    const p1Join = await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });

    const myCard = p1Join.gameState.players.p1.hand[0];
    const target = anyLegalTarget(p1Join.gameState, myCard);

    const updatePromise = new Promise<any>((resolve) => s2.once('game_state', resolve));
    const playResult = await emitAck<any>(s1, 'play_card', { roomCode, value: myCard, target });
    expect(playResult.ok).toBe(true);

    const broadcast = await updatePromise;
    expect(broadcast.cells[target]).toMatchObject({ value: myCard, owner: 'p1' });
    expect(broadcast.activeSeat).toBe('p2');
  });

  it('playing through to the last card on both decks ends the game with a declared winner', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    const p1Join = await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });

    // Force both decks empty and p2's hand empty, leaving p1 exactly one
    // card to play - the real engine's end-of-game check then fires
    // through one genuine play_card call over the wire.
    const live = await store.getRoom(roomCode);
    expect(live).not.toBeNull();
    const lastCard = p1Join.gameState.players.p1.hand[0];
    live!.gameState = {
      ...live!.gameState,
      activeSeat: 'p1',
      players: {
        ...live!.gameState.players,
        p1: { ...live!.gameState.players.p1, hand: [lastCard], deck: [] },
        p2: { ...live!.gameState.players.p2, hand: [], deck: [] },
      },
    };

    const target = anyLegalTarget(live!.gameState as any, lastCard);
    const result = await emitAck<any>(s1, 'play_card', { roomCode, value: lastCard, target });
    expect(result.ok).toBe(true);

    const spectator = await connect();
    const spectatorJoin = await emitAck<any>(spectator, 'join_room', { roomCode, role: 'spectator' });
    expect(spectatorJoin.gameState.phase).toBe('ended');
    expect(spectatorJoin.gameState.winner.length).toBeGreaterThan(0);
  });
});
