import { describe, expect, it } from 'vitest';
import { InMemoryRoomRepository, parsePersistedRoomData, type PersistedRoom } from '../src/rooms/roomRepository';

type TestSeat = 'red' | 'blue';

const sample: PersistedRoom<{ dummy: true }, TestSeat> = {
  code: 'ABCD',
  gameId: 'test-game',
  gameState: { dummy: true },
  seatOrder: ['red', 'blue'],
  seats: { red: { seatToken: 'red-token' } },
  createdAt: 0,
  lastActivityAt: 0,
};

describe('parsePersistedRoomData', () => {
  it('parses a raw JSON string (observed behavior from the Postgres driver)', () => {
    const result = parsePersistedRoomData<{ dummy: true }, TestSeat>(JSON.stringify(sample));
    expect(result).toEqual(sample);
  });

  it('passes through an already-parsed object unchanged', () => {
    const result = parsePersistedRoomData(sample);
    expect(result).toBe(sample);
  });
});

describe('InMemoryRoomRepository.findByAccountEmail', () => {
  function room(overrides: Partial<PersistedRoom<{ dummy: true }, TestSeat>>): PersistedRoom<{ dummy: true }, TestSeat> {
    return { ...sample, ...overrides };
  }

  it('finds a room where the email holds any seat', async () => {
    const repo = new InMemoryRoomRepository<{ dummy: true }, TestSeat>();
    await repo.save(room({ code: 'AAAA', knownAccounts: { blue: 'alice@example.com' } }));

    const found = await repo.findByAccountEmail('test-game', 'alice@example.com');
    expect(found.map((r) => r.code)).toEqual(['AAAA']);
  });

  it('excludes rooms for a different gameId, even if the email matches', async () => {
    const repo = new InMemoryRoomRepository<{ dummy: true }, TestSeat>();
    await repo.save(room({ code: 'AAAA', gameId: 'other-game', knownAccounts: { blue: 'alice@example.com' } }));

    expect(await repo.findByAccountEmail('test-game', 'alice@example.com')).toEqual([]);
  });

  it('excludes rooms where the email never held a seat', async () => {
    const repo = new InMemoryRoomRepository<{ dummy: true }, TestSeat>();
    await repo.save(room({ code: 'AAAA', knownAccounts: { blue: 'bob@example.com' } }));

    expect(await repo.findByAccountEmail('test-game', 'alice@example.com')).toEqual([]);
  });

  it('is unmatched for a room with no knownAccounts at all (pre-accounts room)', async () => {
    const repo = new InMemoryRoomRepository<{ dummy: true }, TestSeat>();
    await repo.save(room({ code: 'AAAA', knownAccounts: undefined }));

    expect(await repo.findByAccountEmail('test-game', 'alice@example.com')).toEqual([]);
  });
});
