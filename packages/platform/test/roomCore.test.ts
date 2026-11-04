import { describe, expect, it } from 'vitest';
import type { Namespace } from 'socket.io';
import { ok } from '@denimcat/shared';
import { applyAction } from '../src/rooms/roomCore';
import { InMemoryRoomRepository } from '../src/rooms/roomRepository';
import { createNoopEmailSender } from '../src/email';
import type { GameModule } from '../src/gameModule';
import type { RoomStoreContext } from '../src/rooms/roomStoreContext';

type TestSeat = 'p1' | 'p2';
type TestState = { value: number; finished: boolean };

function makeModule(): GameModule<TestState, undefined, TestSeat> {
  return {
    id: 'test-game',
    displayName: 'Test Game',
    namespace: '/test',
    minSeats: 2,
    maxSeats: 2,
    parseConfig: () => undefined,
    seatsForConfig: () => ['p1', 'p2'],
    createInitialState: () => ({ value: 0, finished: false }),
    registerHandlers: () => {},
    isRoomFinished: (state) => state.finished,
  };
}

function fakeNamespace(): Namespace {
  return { to: () => ({ emit: () => {} }) } as unknown as Namespace;
}

function makeCtx(repository: InMemoryRoomRepository<TestState, TestSeat>): RoomStoreContext<TestState, undefined, TestSeat> {
  return {
    module: makeModule(),
    repository,
    nsp: fakeNamespace(),
    cache: new Map(),
    hydrating: new Map(),
    socketBindings: new Map(),
    graceTimers: new Map(),
    graceMs: 2 * 60 * 1000,
    idleTimeoutMs: 30 * 60 * 1000,
    idleTimeoutAfterRecapMs: 7 * 24 * 60 * 60 * 1000,
    emailSender: createNoopEmailSender(),
    appBaseUrl: undefined,
  };
}

describe('applyAction', () => {
  it('persists recapViewedBy after a game-ending action, not just in the in-memory cache', async () => {
    const repository = new InMemoryRoomRepository<TestState, TestSeat>();
    await repository.save({
      code: 'ABCD',
      gameId: 'test-game',
      gameState: { value: 0, finished: false },
      seatOrder: ['p1', 'p2'],
      seats: { p1: { seatToken: 'tok-1' }, p2: { seatToken: 'tok-2' } },
      knownAccounts: { p1: 'alice@example.com', p2: 'bob@example.com' },
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const ctx = makeCtx(repository);
    const room = (await ctx.repository.get('ABCD'))!;
    ctx.cache.set('ABCD', {
      code: room.code,
      roomId: 'room-1',
      gameState: room.gameState,
      seatOrder: room.seatOrder,
      seats: { p1: { seatToken: 'tok-1', socketId: 'sock-1', disconnectedAt: null }, p2: { seatToken: 'tok-2', socketId: null, disconnectedAt: null } },
      knownEmails: {},
      knownAccounts: room.knownAccounts!,
      knownNames: {},
      chatMessages: [],
      recapViewedBy: {},
      spectatorSocketIds: new Set(),
      createdAt: room.createdAt,
      lastActivityAt: room.lastActivityAt,
    });
    ctx.socketBindings.set('sock-1', { code: 'ABCD', role: 'p1' });

    const result = await applyAction(ctx, 'ABCD', 'sock-1', (state) => ok({ ...state, finished: true }));
    expect(result.ok).toBe(true);

    // Read back via the REPOSITORY directly, not ctx.cache — this is what
    // would have passed even if persist() silently stopped running (or ran
    // before notifyGameEnd's mutation instead of after it).
    const persisted = await repository.get('ABCD');
    expect(persisted?.recapViewedBy?.['alice@example.com']).toBe(true);
  });
});
