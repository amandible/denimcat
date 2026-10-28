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

    const joined = await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, 'Alex', 'alice@example.com');
    expect(joined.ok).toBe(true);

    const info = await store.getRoomInfo(created.roomCode);
    expect(info?.seats.p1).toEqual({ claimed: true, connected: true, name: 'Alex' });
    expect(info?.seats.p2).toBeUndefined(); // still open — no entry at all

    await store.joinRoom(created.roomCode, 'p2', 'socket-2', undefined, undefined, 'bob@example.com'); // no name supplied
    const infoAfter = await store.getRoomInfo(created.roomCode);
    expect(infoAfter?.seats.p2).toEqual({ claimed: true, connected: true, name: undefined });

    store.stop();
  });

  it('persists the name across a hydration (room evicted from cache, then re-read from the repository)', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store1 = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store1.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await store1.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, 'Alex', 'alice@example.com');
    store1.stop();

    // A fresh RoomStore simulates a server restart — nothing cached, must
    // hydrate from the repository alone.
    const store2 = new RoomStore(makeModule(), repo, fakeNamespace());
    const info = await store2.getRoomInfo(created.roomCode);
    expect(info?.seats.p1?.name).toBe('Alex');
    store2.stop();
  });
});

describe('RoomStore.buildRoomInfo — a claimed seat stays visible once disconnected', () => {
  it(
    "a claimed seat whose live record has fully expired still appears in room info as claimed " +
      "but not connected, with its name carried forward from knownNames — otherwise it's " +
      'indistinguishable from an open seat to anyone looking at the room (the lobby included)',
    async () => {
      const repo = new InMemoryRoomRepository<TestState, TestSeat>();
      const store = new RoomStore(makeModule(), repo, fakeNamespace(), { graceMs: 1 });
      const created = await store.createRoom(undefined);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, 'Alex', 'alice@example.com');
      await store.handleDisconnect('socket-1');
      await new Promise((resolve) => setTimeout(resolve, 20)); // let the 1ms grace timer fire

      const room = await store.getRoom(created.roomCode);
      expect(room?.seats.p1).toBeUndefined(); // the live record really is gone

      const info = await store.getRoomInfo(created.roomCode);
      expect(info?.seats.p1).toEqual({ claimed: true, connected: false, name: 'Alex' });
      store.stop();
    },
  );

  it('a seat nobody has ever joined still has no entry at all — correctly indistinguishable from "open"', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const info = await store.getRoomInfo(created.roomCode);
    expect(info?.seats.p1).toBeUndefined();
    expect(info?.seats.p2).toBeUndefined();
    store.stop();
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

  it('reconnectRoom never reassigns a seat already associated with a different account, even with a valid seat token', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const joined = await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    // A seat token lives in browser-scoped localStorage, not account-scoped
    // storage — simulates a second account signed in on the same browser
    // presenting alice's still-valid stored token for this seat.
    const reconnected = await store.reconnectRoom(created.roomCode, 'p1', joined.seatToken!, 'socket-2', 'mallory@example.com');
    expect(reconnected.ok).toBe(true); // the live takeover itself still succeeds — the token is valid

    // But ownership-of-record must still be alice's: mallory's account must
    // NOT be able to reclaim this seat later via reconnect_by_account.
    expect((await store.reconnectByAccount(created.roomCode, 'mallory@example.com', 'socket-3')).ok).toBe(false);
    const aliceStillOwns = await store.reconnectByAccount(created.roomCode, 'alice@example.com', 'socket-4');
    expect(aliceStillOwns.ok).toBe(true);
    if (aliceStillOwns.ok) expect(aliceStillOwns.you).toEqual({ role: 'p1' });
    store.stop();
  });

  it(
    "joinRoom refuses a different account's attempt to claim a seat already owned by someone " +
      "else, even once that seat's own live record has fully expired — e.g. alice creates a " +
      'room and joins p1, then closes the tab before anyone else joins; p1\'s live seat record ' +
      "lapses after the ordinary reconnect grace, but a brand-new visitor must not be able to " +
      "pick p1 as if it were never joined — that would silently take over alice's identity in " +
      'the game, including whatever moves she already made',
    async () => {
      const repo = new InMemoryRoomRepository<TestState, TestSeat>();
      const store = new RoomStore(makeModule(), repo, fakeNamespace(), { graceMs: 1 });
      const created = await store.createRoom(undefined);
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
      await store.handleDisconnect('socket-1');
      await new Promise((resolve) => setTimeout(resolve, 20)); // let the 1ms grace timer fire and free the live seat record

      const room = await store.getRoom(created.roomCode);
      expect(room?.seats.p1).toBeUndefined(); // the live record really is gone, same as a never-joined seat would look

      const stolen = await store.joinRoom(created.roomCode, 'p1', 'socket-2', undefined, undefined, 'mallory@example.com');
      expect(stolen).toEqual({ ok: false, error: { code: 'SEAT_TAKEN', message: expect.any(String) } });

      // The original owner can still freshly join her own seat, though —
      // this isn't a lockout, just protection against anyone else.
      const aliceAgain = await store.joinRoom(created.roomCode, 'p1', 'socket-3', undefined, undefined, 'alice@example.com');
      expect(aliceAgain.ok).toBe(true);
      store.stop();
    },
  );
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

type ListState = { turn: TurnSeat | null; finished: boolean };

function makeListModule(): GameModule<ListState, undefined, TurnSeat> {
  return {
    id: 'list-game',
    displayName: 'List Game',
    namespace: '/list',
    minSeats: 2,
    maxSeats: 2,
    parseConfig: () => undefined,
    seatsForConfig: () => ['p1', 'p2'],
    createInitialState: () => ({ turn: 'p1', finished: false }),
    registerHandlers: () => {},
    getActiveSeat: (state) => (state.finished ? null : state.turn),
    isRoomFinished: (state) => state.finished,
  };
}

/**
 * Flips `finished` to true in BOTH the repository (what listOpenRoomsForAccount
 * reads via findByAccountEmail) and the live cached room (what getRoom-based
 * methods like joinRoom/reconnectRoom/reconnectByAccount read) — these are
 * two different read paths, so a test exercising both needs both updated,
 * same as the existing precedent elsewhere in this file for "mutating the
 * live cached object directly is enough, same instance getRoom returns".
 */
async function finishRoom(store: RoomStore<ListState, undefined, TurnSeat>, repo: InMemoryRoomRepository<ListState, TurnSeat>, code: string): Promise<void> {
  const persisted = await repo.get(code);
  if (!persisted) throw new Error('room not persisted');
  await repo.save({ ...persisted, gameState: { ...persisted.gameState, finished: true } });

  const live = await store.getRoom(code);
  if (live) live.gameState = { ...live.gameState, finished: true };
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

describe('RoomStore.notifyGameEnd', () => {
  it('emails every seat with a knownEmails entry once the room becomes finished', async () => {
    const sender = fakeEmailSender();
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace(), { emailSender: sender });
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', 'p1@example.com');
    await store.joinRoom(created.roomCode, 'p2', 'socket-2', 'p2@example.com');

    const result = await store.applyAction(created.roomCode, 'socket-1', () => ok<ListState>({ turn: null, finished: true }));
    expect(result.ok).toBe(true);

    expect(sender.calls).toHaveLength(2);
    expect(sender.calls.map((c) => c.to).sort()).toEqual(['p1@example.com', 'p2@example.com']);
    expect(sender.calls[0].subject).toContain('List Game');
    store.stop();
  });

  it('does not email again on a later action once already finished', async () => {
    const sender = fakeEmailSender();
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace(), { emailSender: sender });
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', 'p1@example.com');
    await store.applyAction(created.roomCode, 'socket-1', () => ok<ListState>({ turn: null, finished: true }));
    expect(sender.calls).toHaveLength(1);

    await store.applyAction(created.roomCode, 'socket-1', () => ok<ListState>({ turn: null, finished: true })); // another action, still finished
    expect(sender.calls).toHaveLength(1); // no new email — was already finished before this action too

    store.stop();
  });

  it('marks recapViewedBy true for every account with a currently-connected socket at the moment the game ends', async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    await store.joinRoom(created.roomCode, 'p2', 'socket-2', undefined, undefined, 'bob@example.com');

    await store.applyAction(created.roomCode, 'socket-1', () => ok<ListState>({ turn: null, finished: true }));

    const room = await store.getRoom(created.roomCode);
    expect(room?.recapViewedBy['alice@example.com']).toBe(true);
    expect(room?.recapViewedBy['bob@example.com']).toBe(true);
    store.stop();
  });

  it('does NOT mark recapViewedBy for an account with no live connection at that moment', async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    await store.joinRoom(created.roomCode, 'p2', 'socket-2', undefined, undefined, 'bob@example.com');
    await store.handleDisconnect('socket-2'); // bob goes offline before the game ends

    await store.applyAction(created.roomCode, 'socket-1', () => ok<ListState>({ turn: null, finished: true }));

    const room = await store.getRoom(created.roomCode);
    expect(room?.recapViewedBy['alice@example.com']).toBe(true); // still connected
    expect(room?.recapViewedBy['bob@example.com']).toBeUndefined(); // offline — left for the join/reconnect backfill instead
    store.stop();
  });
});

describe('RoomStore idle-room sweep', () => {
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

  it('a room no one has ever joined (no known accounts or emails at all) sweeps on the ordinary idle timeout', async () => {
    const past = Date.now() - 1000;
    const repo = await seedEmptyRoom('EMPT', {}, past);
    const store = new RoomStore(makeTurnModule(), repo, fakeNamespace(), {
      idleSweepMs: 15,
      idleTimeoutMs: 20,
    });

    await store.getRoom('EMPT');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(await repo.get('EMPT')).toBeNull();
    store.stop();
  });

  it(
    'never sweeps a room where a seat has ever been claimed by a known account, no matter how ' +
      'long ago its live connection expired or how far past even the LONG timeout — e.g. creating ' +
      "a room, joining as p1 with no email on file, then closing the tab while waiting for a " +
      "friend to accept an invite days later: p1's live seat record lapses after the ordinary " +
      "2-minute reconnect grace, but the room itself must never be auto-deleted just because " +
      'nobody is currently connected to it',
    async () => {
      const past = Date.now() - 1000;
      const repo = new InMemoryRoomRepository<TurnState, TurnSeat>();
      await repo.save({
        code: 'CLMD',
        gameId: 'turn-game',
        gameState: { turn: 'p1' },
        seatOrder: ['p1', 'p2'],
        seats: {}, // live record already expired — nobody currently connected
        knownAccounts: { p1: 'alice@example.com' }, // but p1 was genuinely claimed
        // no knownEmails at all — this is specifically the no-email case, which
        // would have gotten only the SHORT timeout under the old tiered logic
        createdAt: past,
        lastActivityAt: past,
      });
      const store = new RoomStore(makeTurnModule(), repo, fakeNamespace(), {
        idleSweepMs: 15,
        idleTimeoutMs: 20,
      });

      await store.getRoom('CLMD');
      await new Promise((resolve) => setTimeout(resolve, 80)); // well past the idle timeout, many sweep cycles

      expect(await repo.get('CLMD')).not.toBeNull();
      store.stop();
    },
  );

  it(
    'never sweeps a finished room while an account that held a seat still has not viewed its recap — ' +
      'otherwise the "stays until viewed" promise breaks for whoever is slowest to look',
    async () => {
      const past = Date.now() - 1000;
      const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
      await repo.save({
        code: 'RCAP',
        gameId: 'list-game',
        gameState: { turn: null, finished: true },
        seatOrder: ['p1', 'p2'],
        seats: {},
        knownAccounts: { p1: 'alice@example.com' },
        recapViewedBy: {}, // alice hasn't looked yet
        createdAt: past,
        lastActivityAt: past,
      });
      const store = new RoomStore(makeListModule(), repo, fakeNamespace(), {
        idleSweepMs: 15,
        idleTimeoutMs: 20,
      });

      await store.getRoom('RCAP');
      await new Promise((resolve) => setTimeout(resolve, 80)); // well past the short timeout

      expect(await repo.get('RCAP')).not.toBeNull();
      store.stop();
    },
  );

  it('sweeps a finished room once every account that held a seat has viewed its recap and the LONGER post-recap grace has passed', async () => {
    const past = Date.now() - 1000;
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    await repo.save({
      code: 'SEEN',
      gameId: 'list-game',
      gameState: { turn: null, finished: true },
      seatOrder: ['p1', 'p2'],
      seats: {},
      knownAccounts: { p1: 'alice@example.com' },
      recapViewedBy: { 'alice@example.com': true },
      createdAt: past,
      lastActivityAt: past,
    });
    const store = new RoomStore(makeListModule(), repo, fakeNamespace(), {
      idleSweepMs: 15,
      idleTimeoutMs: 20,
      idleTimeoutAfterRecapMs: 20,
    });

    await store.getRoom('SEEN');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(await repo.get('SEEN')).toBeNull();
    store.stop();
  });

  it(
    'keeps a finished, fully-viewed room around under the LONGER post-recap grace period even ' +
      "once it's well past the ordinary short idle timeout — e.g. someone wants to come back and " +
      'look at a game that wrapped up a few days ago',
    async () => {
      const past = Date.now() - 1000;
      const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
      await repo.save({
        code: 'RCA2',
        gameId: 'list-game',
        gameState: { turn: null, finished: true },
        seatOrder: ['p1', 'p2'],
        seats: {},
        knownAccounts: { p1: 'alice@example.com' },
        recapViewedBy: { 'alice@example.com': true },
        createdAt: past,
        lastActivityAt: past,
      });
      const store = new RoomStore(makeListModule(), repo, fakeNamespace(), {
        idleSweepMs: 15,
        idleTimeoutMs: 20, // the room is already well past this
        idleTimeoutAfterRecapMs: 10_000, // but nowhere near this
      });

      await store.getRoom('RCA2');
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(await repo.get('RCA2')).not.toBeNull();
      store.stop();
    },
  );
});

describe('RoomStore.listOpenRoomsForAccount', () => {
  it('status is "your-turn" when the active seat is mine', async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    await store.joinRoom(created.roomCode, 'p2', 'socket-2', undefined, undefined, 'bob@example.com');

    const aliceGames = await store.listOpenRoomsForAccount('alice@example.com');
    expect(aliceGames).toHaveLength(1);
    expect(aliceGames[0]).toMatchObject({ code: created.roomCode, gameId: 'list-game', mySeats: ['p1'], seatCount: 2, status: 'your-turn' });

    const bobGames = await store.listOpenRoomsForAccount('bob@example.com');
    expect(bobGames[0].status).toBe('waiting');

    store.stop();
  });

  it('treats a hotseat-shaped room (account holds every seat) as always my turn, with no special-casing needed', async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    await store.joinRoom(created.roomCode, 'p2', 'socket-2', undefined, undefined, 'alice@example.com');

    const games = await store.listOpenRoomsForAccount('alice@example.com');
    expect(games).toHaveLength(1);
    expect(games[0].mySeats).toEqual(['p1', 'p2']);
    expect(games[0].status).toBe('your-turn'); // active seat (p1) is always one of mySeats here

    store.stop();
  });

  it('status is "recap" once the game is finished and I have not yet viewed it', async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    await finishRoom(store, repo, created.roomCode);

    const games = await store.listOpenRoomsForAccount('alice@example.com');
    expect(games).toHaveLength(1);
    expect(games[0].status).toBe('recap');
    expect(games[0].abandonable).toBe(false); // an ended game isn't "abandoned" — see Task 3's plan text
    store.stop();
  });

  it('a finished room drops off the list entirely once I have viewed it', async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    await finishRoom(store, repo, created.roomCode);
    expect((await store.listOpenRoomsForAccount('alice@example.com'))[0].status).toBe('recap');

    // Reconnecting into the finished room marks it viewed — see the
    // "join/reconnect backfills recapViewedBy" describe block below for a
    // direct test of that backfill itself.
    await store.reconnectByAccount(created.roomCode, 'alice@example.com', 'socket-2');
    expect(await store.listOpenRoomsForAccount('alice@example.com')).toEqual([]);
    store.stop();
  });

  it('a hotseat room (I hold every seat) clears for the WHOLE room from one visit, not seat-by-seat', async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    await store.joinRoom(created.roomCode, 'p2', 'socket-2', undefined, undefined, 'alice@example.com');
    await finishRoom(store, repo, created.roomCode);
    expect((await store.listOpenRoomsForAccount('alice@example.com'))[0].status).toBe('recap');

    // One visit, via a single reconnect_by_account call — not one per seat held.
    await store.reconnectByAccount(created.roomCode, 'alice@example.com', 'socket-3');
    expect(await store.listOpenRoomsForAccount('alice@example.com')).toEqual([]);
    store.stop();
  });

  it('returns an empty list for an account that holds no seats anywhere', async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');

    expect(await store.listOpenRoomsForAccount('carol@example.com')).toEqual([]);
    store.stop();
  });

  it("lists the other seat's name when given, and nothing when no other seat has joined or gave no name", async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    expect((await store.listOpenRoomsForAccount('alice@example.com'))[0].otherPlayerNames).toEqual([]);

    await store.joinRoom(created.roomCode, 'p2', 'socket-2', undefined, 'Bob', 'bob@example.com');
    expect((await store.listOpenRoomsForAccount('alice@example.com'))[0].otherPlayerNames).toEqual(['Bob']);
    // Never shows my own seat's name among "other" players.
    expect((await store.listOpenRoomsForAccount('bob@example.com'))[0].otherPlayerNames).toEqual([]);

    store.stop();
  });

  it("keeps showing the other seat's name even after their seat's live record has fully expired", async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace(), { graceMs: 1 });
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    await store.joinRoom(created.roomCode, 'p2', 'socket-2', undefined, 'Bob', 'bob@example.com');

    await store.handleDisconnect('socket-2');
    await new Promise((resolve) => setTimeout(resolve, 20)); // let the 1ms grace timer fire and free the seat

    const room = await store.getRoom(created.roomCode);
    expect(room?.seats.p2).toBeUndefined(); // the live seat record is really gone

    expect((await store.listOpenRoomsForAccount('alice@example.com'))[0].otherPlayerNames).toEqual(['Bob']);
    store.stop();
  });
});

describe('RoomStore.createRoom', () => {
  it('mints a roomId that survives the room being hydrated fresh from the repository', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store1 = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store1.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const room1 = await store1.getRoom(created.roomCode);
    expect(typeof room1?.roomId).toBe('string');
    expect(room1?.roomId.length).toBeGreaterThan(0);
    store1.stop();

    // A fresh RoomStore simulates a server restart — nothing cached, must
    // hydrate from the repository alone.
    const store2 = new RoomStore(makeModule(), repo, fakeNamespace());
    const room2 = await store2.getRoom(created.roomCode);
    expect(room2?.roomId).toBe(room1?.roomId);
    store2.stop();
  });
});

describe('RoomStore join/reconnect backfills recapViewedBy', () => {
  it('joinRoom marks recapViewedBy for an account arriving into an already-finished room', async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await finishRoom(store, repo, created.roomCode);

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    const room = await store.getRoom(created.roomCode);
    expect(room?.recapViewedBy['alice@example.com']).toBe(true);
    store.stop();
  });

  it('reconnectRoom marks recapViewedBy for an account reconnecting into an already-finished room', async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const joined = await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    await finishRoom(store, repo, created.roomCode);

    await store.reconnectRoom(created.roomCode, 'p1', joined.seatToken!, 'socket-2', 'alice@example.com');
    const room = await store.getRoom(created.roomCode);
    expect(room?.recapViewedBy['alice@example.com']).toBe(true);
    store.stop();
  });

  it('reconnectByAccount marks recapViewedBy for an account arriving into an already-finished room', async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    await finishRoom(store, repo, created.roomCode);

    await store.reconnectByAccount(created.roomCode, 'alice@example.com', 'socket-2');
    const room = await store.getRoom(created.roomCode);
    expect(room?.recapViewedBy['alice@example.com']).toBe(true);
    store.stop();
  });

  it('joining/reconnecting into a NOT-yet-finished room never touches recapViewedBy', async () => {
    const repo = new InMemoryRoomRepository<ListState, TurnSeat>();
    const store = new RoomStore(makeListModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    const room = await store.getRoom(created.roomCode);
    expect(room?.recapViewedBy).toEqual({});
    store.stop();
  });
});

describe('RoomStore.sendChatMessage', () => {
  it("appends a message bound to the sender's seat, visible via room info", async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await store.joinRoom(created.roomCode, 'p1', 'socket-1');

    const result = await store.sendChatMessage(created.roomCode, 'socket-1', 'hello', 3, 'Alice');
    expect(result).toEqual({ ok: true });

    const info = await store.getRoomInfo(created.roomCode);
    expect(info?.chatMessages).toHaveLength(1);
    expect(info?.chatMessages[0]).toMatchObject({ seat: 'p1', name: 'Alice', text: 'hello', afterLogIndex: 3 });
    expect(typeof info?.chatMessages[0].id).toBe('string');
    store.stop();
  });

  it('rejects a chat message from a socket not bound to that room', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await store.sendChatMessage(created.roomCode, 'unbound-socket', 'hi', 0);
    expect(result).toEqual({ ok: false, error: { code: 'NOT_IN_ROOM', message: expect.any(String) } });
    store.stop();
  });

  it('caps chat history, dropping the oldest message once it exceeds the limit', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await store.joinRoom(created.roomCode, 'p1', 'socket-1');

    for (let i = 0; i < 201; i++) {
      await store.sendChatMessage(created.roomCode, 'socket-1', `msg-${i}`, 0);
    }

    const info = await store.getRoomInfo(created.roomCode);
    expect(info?.chatMessages).toHaveLength(200);
    expect(info?.chatMessages[0].text).toBe('msg-1'); // msg-0 was the oldest, dropped
    expect(info?.chatMessages[199].text).toBe('msg-200');
    store.stop();
  });
});

describe('RoomStore.abandonRoom and OpenGameSummary.abandonable', () => {
  it('a solo room (no other seat ever joined) is abandonable, and abandoning it deletes it', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');

    const listed = await store.listOpenRoomsForAccount('alice@example.com');
    expect(listed[0].abandonable).toBe(true);

    const result = await store.abandonRoom(created.roomCode, 'alice@example.com');
    expect(result).toEqual({ ok: true });
    expect(await repo.get(created.roomCode)).toBeNull();
    store.stop();
  });

  it('a hotseat-shaped room (one account holds every seat) is abandonable', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    await store.joinRoom(created.roomCode, 'p2', 'socket-2', undefined, undefined, 'alice@example.com');

    const listed = await store.listOpenRoomsForAccount('alice@example.com');
    expect(listed[0].abandonable).toBe(true);
    store.stop();
  });

  it('is not abandonable once a different account has joined another seat, and abandonRoom refuses it', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');
    await store.joinRoom(created.roomCode, 'p2', 'socket-2', undefined, undefined, 'bob@example.com');

    const listed = await store.listOpenRoomsForAccount('alice@example.com');
    expect(listed[0].abandonable).toBe(false);

    const result = await store.abandonRoom(created.roomCode, 'alice@example.com');
    expect(result).toEqual({ ok: false, error: { code: 'NOT_ABANDONABLE', message: expect.any(String) } });
    expect(await repo.get(created.roomCode)).not.toBeNull();
    store.stop();
  });

  it('abandonRoom refuses an account that holds no seat in the room, and a nonexistent room', async () => {
    const repo = new InMemoryRoomRepository<TestState, TestSeat>();
    const store = new RoomStore(makeModule(), repo, fakeNamespace());
    const created = await store.createRoom(undefined);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await store.joinRoom(created.roomCode, 'p1', 'socket-1', undefined, undefined, 'alice@example.com');

    const notMine = await store.abandonRoom(created.roomCode, 'mallory@example.com');
    expect(notMine).toEqual({ ok: false, error: { code: 'NOT_YOUR_ROOM', message: expect.any(String) } });

    const notFound = await store.abandonRoom('NOPE', 'alice@example.com');
    expect(notFound).toEqual({ ok: false, error: { code: 'ROOM_NOT_FOUND', message: expect.any(String) } });
    store.stop();
  });
});
