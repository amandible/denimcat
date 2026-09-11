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

describe('Mint Condition room + game flow over real sockets', () => {
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

  it('rejects an invalid player count at room creation', async () => {
    const socket = await connect();
    const result = await emitAck<any>(socket, 'create_room', { playerCount: 5 });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_CONFIG');
  });

  it('rejects joining a seat that does not exist for this room (e.g. p3 in a 2-player game)', async () => {
    const socket = await connect();
    const roomCode = await createRoom(socket, { playerCount: 2 });
    const result = await emitAck<any>(socket, 'join_room', { roomCode, role: 'p3' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SEAT_NOT_IN_GAME');
  });

  it("peek_room reports exactly the seats a room actually has, matching its player count", async () => {
    const socket = await connect();
    const roomCode = await createRoom(socket, { playerCount: 3 });
    const peek = await emitAck<any>(socket, 'peek_room', { roomCode });
    expect(peek.ok).toBe(true);
    expect(peek.roomInfo.seatOrder).toEqual(['p1', 'p2', 'p3']);
    // Bug regression: a 3-player room must never offer a p4 seat.
    expect(peek.roomInfo.seatOrder).not.toContain('p4');
  });

  it('peek_room does not bind the socket to any seat — it can still join a real one afterward', async () => {
    const socket = await connect();
    const roomCode = await createRoom(socket, { playerCount: 2 });
    await emitAck<any>(socket, 'peek_room', { roomCode });
    const join = await emitAck<any>(socket, 'join_room', { roomCode, role: 'p1' });
    expect(join.ok).toBe(true);
  });

  it('peek_room reports an error for a room that does not exist', async () => {
    const socket = await connect();
    const peek = await emitAck<any>(socket, 'peek_room', { roomCode: 'ZZZZ' });
    expect(peek.ok).toBe(false);
    expect(peek.error.code).toBe('ROOM_NOT_FOUND');
  });

  it('never reveals another seat\'s hand contents to a player or a spectator', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const spectatorSocket = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });

    const p1Join = await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    const p2Join = await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });
    const specJoin = await emitAck<any>(spectatorSocket, 'join_room', { roomCode, role: 'spectator' });

    expect(p1Join.ok).toBe(true);
    expect(p2Join.ok).toBe(true);
    expect(specJoin.ok).toBe(true);

    // Each seat sees its own hand...
    expect(Array.isArray(p1Join.gameState.players.p1.hand)).toBe(true);
    expect(p1Join.gameState.players.p1.hand).toHaveLength(2);
    expect(Array.isArray(p2Join.gameState.players.p2.hand)).toBe(true);

    // ...but never the other seat's hand, and a spectator sees neither.
    expect(p1Join.gameState.players.p2.hand).toBeUndefined();
    expect(p1Join.gameState.players.p2.handSize).toBe(2);
    expect(p2Join.gameState.players.p1.hand).toBeUndefined();
    expect(specJoin.gameState.players.p1.hand).toBeUndefined();
    expect(specJoin.gameState.players.p2.hand).toBeUndefined();

    // Deck order/contents are never revealed to anyone, including the owner.
    expect(p1Join.gameState.players.p1.deck).toBeUndefined();
    expect(typeof p1Join.gameState.players.p1.deckSize).toBe('number');
  });

  it('never reveals the current bid\'s specific committed cards to the other seat, only the amount', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    const p1Join = await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    const p2Join = await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });

    const views: Record<string, any> = { p1: p1Join.gameState, p2: p2Join.gameState };
    const sockets: Record<string, ClientSocket> = { p1: s1, p2: s2 };
    const activeSeat = p1Join.gameState.auction.activeSeat as 'p1' | 'p2';
    const card = views[activeSeat].players[activeSeat].hand[0];

    const bidResult = await emitAck<any>(sockets[activeSeat], 'place_bid', { roomCode, cards: [card] });
    expect(bidResult.ok).toBe(true);

    // Peek at the post-bid state via a dedicated spectator connection
    // (rather than reusing a seated socket, which would overwrite its seat
    // binding) to check bid redaction.
    const spectatorSocket = await connect();
    const peek = await emitAck<any>(spectatorSocket, 'join_room', { roomCode, role: 'spectator' });
    expect(peek.ok).toBe(true);
    expect(peek.gameState.auction.highestBid).toEqual({ seat: activeSeat, amount: card });
    // no `cards` field at all in the wire view
    expect(peek.gameState.auction.highestBid.cards).toBeUndefined();
  });

  it('plays a bid through to resolution: pass, win, and either take or skip a prize', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    const p1Join = await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    const p2Join = await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });

    const sockets = { p1: s1, p2: s2 };
    const views = { p1: p1Join.gameState, p2: p2Join.gameState };
    const activeSeat = p1Join.gameState.auction.activeSeat as 'p1' | 'p2';
    const otherSeat = activeSeat === 'p1' ? 'p2' : 'p1';
    const card = views[activeSeat].players[activeSeat].hand[0];

    const bid = await emitAck<any>(sockets[activeSeat], 'place_bid', { roomCode, cards: [card] });
    expect(bid.ok).toBe(true);

    const passResult = await emitAck<any>(sockets[otherSeat], 'pass', { roomCode });
    expect(passResult.ok).toBe(true);

    // Peek at the room's post-pass state via a spectator join.
    const spectatorSocket = await connect();
    const peek = await emitAck<any>(spectatorSocket, 'join_room', { roomCode, role: 'spectator' });
    expect(peek.gameState.phase).toBe('awaiting-prize-choice');
    expect(peek.gameState.auction.winnerSeat).toBe(activeSeat);

    const affordable = peek.gameState.priceSlots.flatMap((slot: any) => (slot.price <= card ? slot.prizes : []));
    let after: any;
    if (affordable.length > 0) {
      after = await emitAck<any>(sockets[activeSeat], 'take_prize', { roomCode, prizeId: affordable[0].id });
    } else {
      after = await emitAck<any>(sockets[activeSeat], 'skip_prize_choice', { roomCode });
    }
    expect(after.ok).toBe(true);

    const peek2 = await emitAck<any>(spectatorSocket, 'join_room', { roomCode, role: 'spectator' });
    expect(['awaiting-new-prize-placement', 'auction-active', 'ended']).toContain(peek2.gameState.phase);

    if (peek2.gameState.phase === 'awaiting-new-prize-placement') {
      const emptySlot = peek2.gameState.priceSlots.findIndex((s: any) => s.prizes.length === 0);
      const placeResult = await emitAck<any>(sockets[activeSeat], 'place_new_prize', { roomCode, slotIndex: emptySlot });
      expect(placeResult.ok).toBe(true);
    }
  });

  it('rejects malformed payloads cleanly instead of crashing, and the server stays usable afterward', async () => {
    const s1 = await connect();
    const s2 = await connect();
    const roomCode = await createRoom(s1, { playerCount: 2 });
    await emitAck<any>(s1, 'join_room', { roomCode, role: 'p1' });
    await emitAck<any>(s2, 'join_room', { roomCode, role: 'p2' });

    const malformedPayloads: Array<[string, unknown]> = [
      ['place_bid', { roomCode, cards: 'not-an-array' }],
      ['place_bid', { roomCode, cards: [] }],
      ['place_bid', { roomCode, cards: [14] }], // out of 1-13 range
      ['pass', {}], // missing roomCode
      ['take_prize', { roomCode, prizeId: 123 }], // wrong type
      ['place_new_prize', { roomCode, slotIndex: 'zero' }],
      ['place_new_prize', { roomCode, slotIndex: 99 }],
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
    // Reconnecting restores the player's own hand, not just public info.
    expect(Array.isArray(reconnectResult.gameState.players.p1.hand)).toBe(true);

    const badReconnectSocket = await connect();
    const badReconnect = await emitAck<any>(badReconnectSocket, 'reconnect_room', {
      roomCode,
      role: 'p1',
      seatToken: 'not-the-real-token',
    });
    expect(badReconnect.ok).toBe(false);
  });
});
