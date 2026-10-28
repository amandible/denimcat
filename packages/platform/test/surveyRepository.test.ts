import { describe, expect, it } from 'vitest';
import { InMemorySurveyRepository, type SurveyResponse } from '../src/surveys/surveyRepository';

function response(overrides: Partial<Omit<SurveyResponse, 'createdAt'>> = {}): Omit<SurveyResponse, 'createdAt'> {
  return {
    gameId: 'tashkalar',
    roomId: 'room-1',
    roomCode: 'ABCD',
    seat: 'red',
    accountEmail: 'alice@example.com',
    questionId: 'fun',
    answer: 'It was great!',
    ...overrides,
  };
}

describe('InMemorySurveyRepository', () => {
  it('submit() then listForGame() returns it', async () => {
    const repo = new InMemorySurveyRepository();
    await repo.submit(response());

    const found = await repo.listForGame('tashkalar');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject(response());
    expect(typeof found[0].createdAt).toBe('number');
  });

  it('listForGame() only returns rows for that gameId', async () => {
    const repo = new InMemorySurveyRepository();
    await repo.submit(response({ gameId: 'tashkalar' }));
    await repo.submit(response({ gameId: 'mint-condition', roomId: 'room-2' }));

    const found = await repo.listForGame('tashkalar');
    expect(found.map((r) => r.gameId)).toEqual(['tashkalar']);
  });

  it('listForGame() returns newest first', async () => {
    const repo = new InMemorySurveyRepository();
    await repo.submit(response({ roomId: 'room-older', questionId: 'fun' }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repo.submit(response({ roomId: 'room-newer', questionId: 'fun' }));

    const found = await repo.listForGame('tashkalar');
    expect(found.map((r) => r.roomId)).toEqual(['room-newer', 'room-older']);
  });

  it('a duplicate submit for the same (roomId, seat, questionId) is a no-op, not a second row', async () => {
    const repo = new InMemorySurveyRepository();
    await repo.submit(response({ answer: 'first answer' }));
    await repo.submit(response({ answer: 'second answer' }));

    const found = await repo.listForGame('tashkalar');
    expect(found).toHaveLength(1);
    expect(found[0].answer).toBe('first answer');
  });

  it('submit() reports whether it actually stored a new row — true the first time, false on a later duplicate', async () => {
    const repo = new InMemorySurveyRepository();
    const first = await repo.submit(response());
    expect(first).toEqual({ stored: true });

    const second = await repo.submit(response({ answer: 'different text, same (roomId, seat, questionId)' }));
    expect(second).toEqual({ stored: false });
  });

  it('getLatestResponseAt() returns null for a game with no responses at all', async () => {
    const repo = new InMemorySurveyRepository();
    expect(await repo.getLatestResponseAt('tashkalar')).toBeNull();
  });

  it('getLatestResponseAt() returns the newest createdAt across every response for that game', async () => {
    const repo = new InMemorySurveyRepository();
    await repo.submit(response({ roomId: 'room-older', questionId: 'fun' }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const { stored } = await repo.submit(response({ roomId: 'room-newer', questionId: 'fun' }));
    expect(stored).toBe(true);

    const [latest] = await repo.listForGame('tashkalar');
    expect(await repo.getLatestResponseAt('tashkalar')).toBe(latest.createdAt);
  });

  it('getReadAt() returns null until markRead() has been called for that (email, gameId)', async () => {
    const repo = new InMemorySurveyRepository();
    expect(await repo.getReadAt('owner@example.com', 'tashkalar')).toBeNull();

    await repo.markRead('owner@example.com', 'tashkalar', 12345);
    expect(await repo.getReadAt('owner@example.com', 'tashkalar')).toBe(12345);
  });

  it('markRead() overwrites a previous read time for the same (email, gameId), and keys separately per game', async () => {
    const repo = new InMemorySurveyRepository();
    await repo.markRead('owner@example.com', 'tashkalar', 100);
    await repo.markRead('owner@example.com', 'tashkalar', 200);
    expect(await repo.getReadAt('owner@example.com', 'tashkalar')).toBe(200);

    await repo.markRead('owner@example.com', 'mint-condition', 999);
    expect(await repo.getReadAt('owner@example.com', 'tashkalar')).toBe(200);
    expect(await repo.getReadAt('owner@example.com', 'mint-condition')).toBe(999);
  });
});
