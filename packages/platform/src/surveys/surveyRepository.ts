import { getDb } from '../db/client';

/**
 * One answer to one standard question, from one seat, in one room.
 * Independent of the room's own lifecycle (see roomId's doc comment on
 * PersistedRoom) — a response must survive its room being deleted, so
 * there's deliberately no foreign key back to `rooms`.
 */
export interface SurveyResponse {
  gameId: string;
  /** The room's durable identity — see PersistedRoom.roomId. Never the recyclable 4-character room code. */
  roomId: string;
  /** Kept for display only (e.g. "the Tuesday game") — never used for uniqueness or lookups, since it can be reused after deletion. */
  roomCode: string;
  seat: string;
  accountEmail: string;
  questionId: string;
  answer: string;
  createdAt: number;
}

export interface SurveyRepository {
  /** Idempotent on (roomId, seat, questionId) — a duplicate submit (e.g. a network retry) is a silent no-op, never an error or a second row. */
  submit(response: Omit<SurveyResponse, 'createdAt'>): Promise<void>;
  /** Every response for a game, newest first. */
  listForGame(gameId: string): Promise<SurveyResponse[]>;
}

function responseKey(response: Pick<SurveyResponse, 'roomId' | 'seat' | 'questionId'>): string {
  return `${response.roomId}:${response.seat}:${response.questionId}`;
}

/** Used for tests and as the sole store when no DATABASE_URL is configured. */
export class InMemorySurveyRepository implements SurveyRepository {
  private responses = new Map<string, SurveyResponse>();

  async submit(response: Omit<SurveyResponse, 'createdAt'>): Promise<void> {
    const key = responseKey(response);
    if (this.responses.has(key)) return; // first write wins — same effect as the real table's ON CONFLICT DO NOTHING
    this.responses.set(key, { ...response, createdAt: Date.now() });
  }

  async listForGame(gameId: string): Promise<SurveyResponse[]> {
    return [...this.responses.values()].filter((r) => r.gameId === gameId).sort((a, b) => b.createdAt - a.createdAt);
  }
}

/**
 * Independent of `rooms` — a response must outlive its room being deleted
 * (see admin-delete-room.ts) and support "every answer ever given for this
 * game" across rooms, which a per-room JSONB blob can't. Unlike every other
 * repository in this codebase, `submit()` deliberately does NOT fail soft:
 * losing a submitted answer silently would be worse than the submitter
 * seeing a failed request they can retry. `listForGame()` stays fail-soft
 * (catch, log, empty array), matching PostgresRoomRepository's own read-path
 * convention — an empty notes page degrading gracefully is fine where
 * losing a submission would not be.
 */
export class PostgresSurveyRepository implements SurveyRepository {
  async submit(response: Omit<SurveyResponse, 'createdAt'>): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db`
      INSERT INTO survey_responses (game_id, room_id, room_code, seat, account_email, question_id, answer)
      VALUES (${response.gameId}, ${response.roomId}, ${response.roomCode}, ${response.seat}, ${response.accountEmail}, ${response.questionId}, ${response.answer})
      ON CONFLICT (room_id, seat, question_id) DO NOTHING
    `;
  }

  async listForGame(gameId: string): Promise<SurveyResponse[]> {
    const db = getDb();
    if (!db) return [];
    try {
      const rows = await db<
        { game_id: string; room_id: string; room_code: string; seat: string; account_email: string; question_id: string; answer: string; created_at: Date }[]
      >`
        SELECT game_id, room_id, room_code, seat, account_email, question_id, answer, created_at
        FROM survey_responses WHERE game_id = ${gameId} ORDER BY created_at DESC
      `;
      return rows.map((row) => ({
        gameId: row.game_id,
        roomId: row.room_id,
        roomCode: row.room_code,
        seat: row.seat,
        accountEmail: row.account_email,
        questionId: row.question_id,
        answer: row.answer,
        createdAt: row.created_at.getTime(),
      }));
    } catch (error) {
      console.error(`[db] failed to list survey responses for ${gameId}:`, error);
      return [];
    }
  }
}

/** Picks the Postgres-backed repository when Neon is configured, else an in-memory-only fallback. */
export function createDefaultSurveyRepository(): SurveyRepository {
  return getDb() ? new PostgresSurveyRepository() : new InMemorySurveyRepository();
}
