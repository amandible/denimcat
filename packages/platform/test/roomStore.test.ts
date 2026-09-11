import { describe, expect, it } from 'vitest';
import type { Namespace } from 'socket.io';
import { RoomStore } from '../src/rooms/roomStore';
import { InMemoryRoomRepository } from '../src/rooms/roomRepository';
import type { GameModule } from '../src/gameModule';

type TestSeat = 'p1' | 'p2';
type TestState = { value: number };

function makeModule(): GameModule<TestState, undefined, TestSeat> {
  return {
    id: 'test-game',
    displayName: 'Test Game',
    namespace: '/test',
    minSeats: 2,
    maxSeats: 2,
    parseConfig: () => undefined,
    seatsForConfig: () => ['p1', 'p2'],
    createInitialState: () => ({ value: 0 }),
    registerHandlers: () => {},
  };
}

function fakeNamespace(): Namespace {
  return { to: () => ({ emit: () => {} }) } as unknown as Namespace;
}

async function seedRepo(code: string): Promise<InMemoryRoomRepository<TestState, TestSeat>> {
  const repo = new InMemoryRoomRepository<TestState, TestSeat>();
  await repo.save({
    code,
    gameId: 'test-game',
    gameState: { value: 0 },
    seatOrder: ['p1', 'p2'],
    seats: { p1: { seatToken: 'tok-1' }, p2: { seatToken: 'tok-2' } },
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  });
  return repo;
}

describe('RoomStore concurrent hydration', () => {
  it('two concurrent getRoom calls on an uncached, persisted room hydrate only once', async () => {
    const repo = await seedRepo('ABCD');
    const store = new RoomStore(makeModule(), repo, fakeNamespace());

    const [a, b] = await Promise.all([store.getRoom('ABCD'), store.getRoom('ABCD')]);
    expect(a).not.toBeNull();
    expect(a).toBe(b); // same object reference: only one LiveRoom was ever constructed

    store.stop();
  });

  it(
    'two seats reconnecting at the same instant (e.g. both clients racing to reconnect ' +
      "right after a machine cold-start) both end up bound on the room that's actually cached, " +
      'rather than one landing on an orphaned copy that never gets broadcast to again',
    async () => {
      const repo = await seedRepo('WXYZ');
      const store = new RoomStore(makeModule(), repo, fakeNamespace());

      const [p1, p2] = await Promise.all([
        store.reconnectRoom('WXYZ', 'p1', 'tok-1', 'socket-1'),
        store.reconnectRoom('WXYZ', 'p2', 'tok-2', 'socket-2'),
      ]);
      expect(p1.ok).toBe(true);
      expect(p2.ok).toBe(true);

      const room = await store.getRoom('WXYZ');
      expect(room?.seats.p1?.socketId).toBe('socket-1');
      expect(room?.seats.p2?.socketId).toBe('socket-2');

      store.stop();
    },
  );
});
