import { describe, expect, it } from 'vitest';
import { parsePersistedRoomData, type PersistedRoom } from '../src/rooms/roomRepository';

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
