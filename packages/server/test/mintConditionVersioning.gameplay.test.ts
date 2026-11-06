import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type { GameState, MintConditionConfig, SeatId } from '@denimcat/engine-mint-condition';
import { InMemoryRoomRepository, RoomStore, attachSocketHandlers } from '@denimcat/platform';
import { mintConditionModule } from '../src/games/mint-condition/module';

function emitAck<T>(socket: ClientSocket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, ...args, resolve);
  });
}

async function createRoom(socket: ClientSocket, config: MintConditionConfig): Promise<string> {
  const result = await emitAck<{ ok: true; roomCode: string } | { ok: false; error: unknown }>(
    socket,
    'create_room',
    config,
  );
  if (!result.ok) throw new Error(`create_room failed: ${JSON.stringify(result.error)}`);
  return result.roomCode;
}

/** Sets up a room where the winner's bid affords nothing, so choose_auction_reward is the live choice. */
function setupEmptyAuctionReward(gameState: GameState, winnerSeat: SeatId) {
  gameState.phase = 'awaiting-prize-choice';
  gameState.auction.winnerSeat = winnerSeat;
  gameState.auction.highestBid = { seat: winnerSeat, cardValues: [], amount: 0 }; // below every slot's price
  for (const slot of gameState.priceSlots) slot.prizes = [];
}

describe('Mint Condition ruleset versioning over real sockets', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let store: RoomStore<GameState, MintConditionConfig, SeatId>;
  let baseUrl: string;
  let clients: ClientSocket[] = [];

  beforeEach(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    const nsp = io.of(mintConditionModule.namespace);
    store = new RoomStore(mintConditionModule, new InMemoryRoomRepository<GameState, SeatId>(), nsp, {
      graceMs: 150,
      idleSweepMs: 10_000,
    });
    attachSocketHandlers(nsp, store, mintConditionModule);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}${mintConditionModule.namespace}`;
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

  it('stamps a brand-new room with the current ruleset version and surfaces its notice', async () => {
    const socket = await connect();
    const roomCode = await createRoom(socket, { playerCount: 2 });
    const peek = await emitAck<any>(socket, 'peek_room', { roomCode });
    expect(peek.roomInfo.rulesetVersion).toBe('v2');
    expect(peek.roomInfo.rulesetNotice.isCurrentVersion).toBe(true);
    expect(peek.roomInfo.rulesetNotice.designerNote).toBeTruthy();
    expect(peek.roomInfo.rulesetNotice.whatsNew).toBeTruthy();
  });

  it('keeps a v1-pinned room on v1 rules even though v2 is current: rejects the v2 reward shape', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });

    const room = await store.getRoom(roomCode);
    room!.rulesetVersion = 'v1';
    setupEmptyAuctionReward(room!.gameState, 'p1');

    // v2's object-shaped reward must be REJECTED by this v1-pinned room's engine dispatch...
    const v2Shape = await emitAck<any>(s1, 'choose_auction_reward', { roomCode, reward: { extraShift: true, addPrize: false } });
    expect(v2Shape.ok).toBe(false);

    // ...while v1's original string-shaped reward is accepted.
    const v1Shape = await emitAck<any>(s1, 'choose_auction_reward', { roomCode, reward: 'draw_cards' });
    expect(v1Shape.ok).toBe(true);
  });

  it('a room on the current (v2) version accepts the v2 reward shape and rejects the old v1 string', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });

    const room = await store.getRoom(roomCode);
    expect(room!.rulesetVersion).toBe('v2'); // sanity: a fresh room is already on current
    setupEmptyAuctionReward(room!.gameState, 'p1');

    const v1Shape = await emitAck<any>(s1, 'choose_auction_reward', { roomCode, reward: 'draw_cards' });
    expect(v1Shape.ok).toBe(false);

    const v2Shape = await emitAck<any>(s1, 'choose_auction_reward', { roomCode, reward: { extraShift: false, addPrize: false } });
    expect(v2Shape.ok).toBe(true);
  });

  it('v2 always places a new prize in the lowest slot regardless of the requested slotIndex', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });

    const room = await store.getRoom(roomCode);
    room!.gameState.phase = 'awaiting-new-prize-placement';
    room!.gameState.auction.winnerSeat = 'p1';
    room!.gameState.revealedPrize = { id: 'test-prize', color: 'red', points: 3 };
    for (const slot of room!.gameState.priceSlots) slot.prizes = [];

    const result = await emitAck<any>(s1, 'place_new_prize', { roomCode, slotIndex: 5 });
    expect(result.ok).toBe(true);

    const afterRoom = await store.getRoom(roomCode);
    expect(afterRoom!.gameState.priceSlots[0].prizes).toHaveLength(1);
    expect(afterRoom!.gameState.priceSlots[5].prizes).toHaveLength(0);
  });
});
