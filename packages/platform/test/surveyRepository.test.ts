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
});
