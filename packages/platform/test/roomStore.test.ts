import { describe, expect, it } from 'vitest';
import type { Namespace } from 'socket.io';
import { ok } from '@denimcat/shared';
import { RoomStore } from '../src/rooms/roomStore';
import { InMemoryRoomRepository, type PersistedSeat } from '../src/rooms/roomRepository';
import type { EmailSender } from '../src/email';
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

describe('RoomStore — optional display name at join time', () => {
  it('surfaces a joined seat\'s name in buildRoomInfo, and omits the field entirely when none was given', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const joined = await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, 'Alex');
    expect(joined.ok).toBe(true);

    const info = await store.getRoomInfo(created.roomCode);
    expect(info?.seats.p1).toEqual({ connected: true, name: 'Alex' });
    expect(info?.seats.p2).toBeUndefined(); // still open — no entry at all

    await store.joinRoom(created.roomCode, 'p2', 'socket-2'); // no name supplied
    const infoAfter = await store.getRoomInfo(created.roomCode);
    expect(infoAfter?.seats.p2).toEqual({ connected: true, name: undefined });

    store.stop();
  });

  it('persists the name across a hydration (room evicted from cache, then re-read from the repository)', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store1 = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store1.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await store1.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, 'Alex');
    store1.stop();

    // A fresh RoomStore simulates a server restart — nothing cached, must
    // hydrate from the repository alone.
    const store2 = new RoomStore(makeModule(), repo, fakeNamespace());
    const info = await store2.getRoomInfo(created.roomCode);
    expect(info?.seats.p1?.name).toBe('Alex');
    store2.stop();
  });
});

describe('RoomStore — reconnecting by account identity', () => {
  it('reconnect_by_account finds nothing for an account that has never held a seat here', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await store.reconnectByAccount(created.roomCode, 'nobody@example.com', 'socket-1');
    expect(result).toEqual({ ok: false, error: { code: 'NO_OWNED_SEAT', message: expect.any(String) } });
    store.stop();
  });

  it('joinRoom records the account on the seat, and reconnect_by_account finds it from a different socket with no seat token', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    // A second device/tab, same account, no local seat token for this room at all.
    const result = await store.reconnectByAccount(created.roomCode, 'alice@example.com', 'socket-2');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.you).toEqual({ role: 'p1' });
    expect(typeof result.seatToken).toBe('string');

    const room = await store.getRoom(created.roomCode);
    expect(room?.seats.p1?.socketId).toBe('socket-2'); // took over from socket-1
    store.stop();
  });

  it('still finds the seat after its live record has fully expired (past the reconnect grace), reusing the same game state', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace(), { graceMs: 1 });
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    const room1 = await store.getRoom(created.roomCode);
    room1!.gameState.value = 7; // stands in for real per-seat game progress — mutating the live cached object directly is enough, same instance getRoom returns below

    await store.handleDisconnect('socket-1');
    await new Promise((resolve) => setTimeout(resolve, 20)); // let the 1ms grace timer fire and free the seat

    const room2 = await store.getRoom(created.roomCode);
    expect(room2?.seats.p1).toBeUndefined(); // the live seat record is really gone

    const result = await store.reconnectByAccount(created.roomCode, 'alice@example.com', 'socket-2');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.you).toEqual({ role: 'p1' });
    expect((result.gameState as TestState).value).toBe(7); // same underlying game state, not reset
    store.stop();
  });

  it('reconnectRoom backfills the account association for a seat that predates it', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    await repo.save({
      code: 'OLDR',
      gameId: 'test-game',
      gameState: { value: 0 },
      seatOrder: ['p1', 'p2'],
      seats: { p1: { seatToken: 'tok-1' }, p2: { seatToken: 'tok-2' } }, // no accountEmail on either — "pre-accounts" room
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    });
    const store = new RoomStore(makeModule(), repo, fakeNamespace());

    // Not yet associated — reconnect_by_account can't find it before the owner's first real reconnect.
    expect((await store.reconnectByAccount('OLDR', 'alice@example.com', 'socket-x')).ok).toBe(false);

    await store.reconnectRoom('OLDR', 'p1', 'tok-1', 'socket-1', 'alice@example.com');
    // Now it works, from a different socket with no token at all.
    const result = await store.reconnectByAccount('OLDR', 'alice@example.com', 'socket-2');
    expect(result.ok).toBe(true);
    store.stop();
  });
});

type TurnSeat = 'p1' | 'p2';
type TurnState = { turn: TurnSeat | null };

function makeTurnModule(): GameModule<TurnState, undefined, TurnSeat> {
  return {
    id: 'turn-game',
    displayName: 'Turn Game',
    namespace: '/turn',
    minSeats: 2,
    maxSeats: 2,
    parseConfig: () => undefined,
    seatsForConfig: () => ['p1', 'p2'],
    createInitialState: () => ({ turn: 'p1' }),
    registerHandlers: () => {},
    getActiveSeat: (state) => state.turn,
  };
}

function fakeEmailSender(): EmailSender & { calls: { to: string; subject: string; text: string }[] } {
  const calls: { to: string; subject: string; text: string }[] = [];
  return {
    calls,
    async send(to, subject, text) {
      calls.push({ to, subject, text });
    },
  };
}

async function seedTurnRepo(code: string, seats: Partial<Record<TurnSeat, PersistedSeat>>): Promise<InMemoryRoomRepository<TurnState, TurnSeat>> {
  const repo = new InMemoryRoomRepository<TurnState, TurnSeat>();
  await repo.save({
    code,
    gameId: 'turn-game',
    gameState: { turn: 'p1' },
    seatOrder: ['p1', 'p2'],
    seats,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  });
  return repo;
}

describe('RoomStore async-play turn notifications', () => {
  it('emails the newly-active seat when it is offline and has an email on file', async () => {
    const repo = await seedTurnRepo('AAAA', {
      p1: { seatToken: 'tok-1', email: 'p1@example.com' },
      p2: { seatToken: 'tok-2', email: 'p2@example.com' },
    });
    const sender = fakeEmailSender();
    const store = new RoomStore(makeTurnModule(), repo, fakeNamespace(), { emailSender: sender });

    await store.reconnectRoom('AAAA', 'p1', 'tok-1', 'socket-1'); // p1 connects; p2 never does — offline throughout
    const result = await store.applyAction('AAAA', 'socket-1', () => ok<TurnState>({ turn: 'p2' }));
    expect(result.ok).toBe(true);

    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0].to).toBe('p2@example.com');
    expect(sender.calls[0].subject).toContain('Turn Game');

    store.stop();
  });

  it('does not email when the active seat is unchanged (e.g. a bonus turn)', async () => {
    const repo = await seedTurnRepo('BBBB', {
      p1: { seatToken: 'tok-1', email: 'p1@example.com' },
      p2: { seatToken: 'tok-2', email: 'p2@example.com' },
    });
    const sender = fakeEmailSender();
    const store = new RoomStore(makeTurnModule(), repo, fakeNamespace(), { emailSender: sender });

    await store.reconnectRoom('BBBB', 'p1', 'tok-1', 'socket-1');
    await store.applyAction('BBBB', 'socket-1', () => ok<TurnState>({ turn: 'p1' })); // still p1's turn

    expect(sender.calls).toHaveLength(0);
    store.stop();
  });

  it(
    'DOES email a seat that is still actively connected, as long as it has an email on file — ' +
      'deliberately not trying to guess whether the tab is actively watched (see notifyTurn\'s ' +
      'doc comment): supplying an email at all is already a strong, deliberate async-play signal',
    async () => {
      const repo = await seedTurnRepo('CCCC', {
        p1: { seatToken: 'tok-1', email: 'p1@example.com' },
        p2: { seatToken: 'tok-2', email: 'p2@example.com' },
      });
      const sender = fakeEmailSender();
      const store = new RoomStore(makeTurnModule(), repo, fakeNamespace(), { emailSender: sender });

      await store.reconnectRoom('CCCC', 'p1', 'tok-1', 'socket-1');
      await store.reconnectRoom('CCCC', 'p2', 'tok-2', 'socket-2'); // p2 IS connected
      await store.applyAction('CCCC', 'socket-1', () => ok<TurnState>({ turn: 'p2' }));

      expect(sender.calls).toHaveLength(1);
      expect(sender.calls[0].to).toBe('p2@example.com');
      store.stop();
    },
  );

  it('does not email a seat with no email on file', async () => {
    const repo = await seedTurnRepo('DDDD', {
      p1: { seatToken: 'tok-1', email: 'p1@example.com' },
      p2: { seatToken: 'tok-2' }, // no email
    });
    const sender = fakeEmailSender();
    const store = new RoomStore(makeTurnModule(), repo, fakeNamespace(), { emailSender: sender });

    await store.reconnectRoom('DDDD', 'p1', 'tok-1', 'socket-1');
    await store.applyAction('DDDD', 'socket-1', () => ok<TurnState>({ turn: 'p2' }));

    expect(sender.calls).toHaveLength(0);
    store.stop();
  });

  it('does not email once the game has ended (getActiveSeat returns null)', async () => {
    const repo = await seedTurnRepo('EEEE', {
      p1: { seatToken: 'tok-1', email: 'p1@example.com' },
      p2: { seatToken: 'tok-2', email: 'p2@example.com' },
    });
    const sender = fakeEmailSender();
    const store = new RoomStore(makeTurnModule(), repo, fakeNamespace(), { emailSender: sender });

    await store.reconnectRoom('EEEE', 'p1', 'tok-1', 'socket-1');
    await store.applyAction('EEEE', 'socket-1', () => ok<TurnState>({ turn: null }));

    expect(sender.calls).toHaveLength(0);
    store.stop();
  });

  it('a RoomStore built with no emailSender option defaults to a noop (never throws)', async () => {
    const repo = await seedTurnRepo('FFFF', {
      p1: { seatToken: 'tok-1', email: 'p1@example.com' },
      p2: { seatToken: 'tok-2', email: 'p2@example.com' },
    });
    const store = new RoomStore(makeTurnModule(), repo, fakeNamespace()); // no options at all

    await store.reconnectRoom('FFFF', 'p1', 'tok-1', 'socket-1');
    const result = await store.applyAction('FFFF', 'socket-1', () => ok<TurnState>({ turn: 'p2' }));
    expect(result.ok).toBe(true);

    store.stop();
  });

  it(
    "still emails a seat whose LIVE seat entry is already gone (its own 2-minute reconnect " +
      'grace lapsed before this later turn came back around — the normal case in real async ' +
      'play) as long as knownEmails still has their address on file',
    async () => {
      const repo = new InMemoryRoomRepository<TurnState, TurnSeat>();
      await repo.save({
        code: 'KKKK',
        gameId: 'turn-game',
        gameState: { turn: 'p1' },
        seatOrder: ['p1', 'p2'],
        seats: { p1: { seatToken: 'tok-1' } }, // p2's seat entry is gone, exactly what expireSeat leaves behind
        knownEmails: { p1: 'p1@example.com', p2: 'p2@example.com' }, // but p2's email is still known
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      });
      const sender = fakeEmailSender();
      const store = new RoomStore(makeTurnModule(), repo, fakeNamespace(), { emailSender: sender });

      await store.reconnectRoom('KKKK', 'p1', 'tok-1', 'socket-1');
      const result = await store.applyAction('KKKK', 'socket-1', () => ok<TurnState>({ turn: 'p2' }));
      expect(result.ok).toBe(true);

      expect(sender.calls).toHaveLength(1);
      expect(sender.calls[0].to).toBe('p2@example.com');

      store.stop();
    },
  );

  it(
    'still notifies a player at their ORIGINAL email after they disconnect, their seat expires, and they ' +
      'rejoin via a fresh join_room WITHOUT retyping it — knownEmails is keyed by room+seat, not by the ' +
      'live seat entry, so a blank email field on rejoin never erases what was already on file',
    async () => {
      const repo = new InMemoryRoomRepository<TurnState, TurnSeat>();
      const sender = fakeEmailSender();
      const store = new RoomStore(makeTurnModule(), repo, fakeNamespace(), { emailSender: sender, graceMs: 20 });

      const created = await store.createRoom(undefined);
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const code = created.roomCode;

      await store.joinRoom(code, 'p1', 's1', 'p1@example.com');
      await store.joinRoom(code, 'p2', 's2', 'p2@example.com');
      await store.applyAction(code, 's1', () => ok<TurnState>({ turn: 'p2' })); // p1 -> p2

      await store.handleDisconnect('s1');
      await new Promise((r) => setTimeout(r, 100)); // let p1's reconnect grace (20ms) actually lapse

      await store.joinRoom(code, 'p1', 's3'); // rejoin as p1 — no email supplied this time
      await store.handleDisconnect('s3'); // and goes offline again

      await store.applyAction(code, 's2', () => ok<TurnState>({ turn: 'p1' })); // p2 -> p1, while p1 is offline

      expect(sender.calls.some((c) => c.to === 'p1@example.com')).toBe(true);

      store.stop();
    },
  );
});

describe('RoomStore idle-room sweep — tiered timeout based on known emails', () => {
  async function seedEmptyRoom(
    code: string,
    knownEmails: Partial<Record<TurnSeat, string>>,
    lastActivityAt: number,
  ): Promise<InMemoryRoomRepository<TurnState, TurnSeat>> {
    const repo = new InMemoryRoomRepository<TurnState, TurnSeat>();
    await repo.save({
      code,
      gameId: 'turn-game',
      gameState: { turn: 'p1' },
      seatOrder: ['p1', 'p2'],
      seats: {}, // nobody currently occupies a seat — eligible for sweeping
      knownEmails,
      createdAt: lastActivityAt,
      lastActivityAt,
    });
    return repo;
  }

  it(
    'keeps a room using the long timeout even when only ONE of its two seats has a known ' +
      "email — e.g. creating a room, supplying your own email, and messaging a friend to join " +
      "later; the friend hasn't joined yet (or might never type an email even once they do), " +
      'but the room must not expire before they get around to it',
    async () => {
      const past = Date.now() - 1000; // already well past a short timeout, nowhere near a long one
      const repo = new InMemoryRoomRepository<TurnState, TurnSeat>();
      await repo.save({
        code: 'ONEE',
        gameId: 'turn-game',
        gameState: { turn: 'p1' },
        seatOrder: ['p1', 'p2'],
        seats: {},
        knownEmails: { p1: 'p1@example.com' }, // p2 has no email on file at all — never joined, or joined without one
        createdAt: past,
        lastActivityAt: past,
      });

      const store = new RoomStore(makeTurnModule(), repo, fakeNamespace(), {
        idleSweepMs: 15,
        idleTimeoutMs: 20,
        idleTimeoutWithEmailsMs: 10_000,
      });

      await store.getRoom('ONEE');
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(await repo.get('ONEE')).not.toBeNull();
      store.stop();
    },
  );

  it('a room no one has ever joined (no known emails at all) uses the short timeout, not the long one', async () => {
    const past = Date.now() - 1000;
    const repo = await seedEmptyRoom('EMPT', {}, past);
    const store = new RoomStore(makeTurnModule(), repo, fakeNamespace(), {
      idleSweepMs: 15,
      idleTimeoutMs: 20,
      idleTimeoutWithEmailsMs: 10_000,
    });

    await store.getRoom('EMPT');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(await repo.get('EMPT')).toBeNull();
    store.stop();
  });
});
