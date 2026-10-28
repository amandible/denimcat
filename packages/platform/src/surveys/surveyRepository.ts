import type { SurveyResponse } from '@denimcat/shared';
import { getDb } from '../db/client';

export type { SurveyResponse };

export interface SurveyRepository {
  /**
   * Idempotent on (roomId, seat, questionId) — a duplicate submit (e.g. a
   * network retry, or a player re-answering a question they already
   * answered) never errors or creates a second row; the first answer
   * always wins. Returns `stored: true` only when this call's row was the
   * one actually written, so a caller (the survey route) can tell a
   * genuinely-new answer apart from one that silently matched something
   * already on file — the route surfaces that distinction back to the
   * client rather than claiming success for an answer that was discarded.
   */
  submit(response: Omit<SurveyResponse, 'createdAt'>): Promise<{ stored: boolean }>;
  /** Every response for a game, newest first. */
  listForGame(gameId: string): Promise<SurveyResponse[]>;
  /** The newest `createdAt` across every response for a game, or null if it has none — the "is there new feedback" signal compared against getReadAt. */
  getLatestResponseAt(gameId: string): Promise<number | null>;
  /** When this account last viewed this game's notes page, or null if never — see NotesView. */
  getReadAt(email: string, gameId: string): Promise<number | null>;
  /** Records that this account viewed this game's notes page at `at` — upserts, so a later call for the same (email, gameId) overwrites rather than erroring. */
  markRead(email: string, gameId: string, at: number): Promise<void>;
}

function responseKey(response: Pick<SurveyResponse, 'roomId' | 'seat' | 'questionId'>): string {
  return `${response.roomId}:${response.seat}:${response.questionId}`;
}

/** Used for tests and as the sole store when no DATABASE_URL is configured. */
export class InMemorySurveyRepository implements SurveyRepository {
  private responses = new Map<string, SurveyResponse>();
  private readAt = new Map<string, number>();

  async submit(response: Omit<SurveyResponse, 'createdAt'>): Promise<{ stored: boolean }> {
    const key = responseKey(response);
    if (this.responses.has(key)) return { stored: false }; // first write wins — same effect as the real table's ON CONFLICT DO NOTHING
    this.responses.set(key, { ...response, createdAt: Date.now() });
    return { stored: true };
  }

  async listForGame(gameId: string): Promise<SurveyResponse[]> {
    return [...this.responses.values()].filter((r) => r.gameId === gameId).sort((a, b) => b.createdAt - a.createdAt);
  }

  async getLatestResponseAt(gameId: string): Promise<number | null> {
    const forGame = await this.listForGame(gameId);
    return forGame[0]?.createdAt ?? null;
  }

  async getReadAt(email: string, gameId: string): Promise<number | null> {
    return this.readAt.get(`${email}:${gameId}`) ?? null;
  }

  async markRead(email: string, gameId: string, at: number): Promise<void> {
    this.readAt.set(`${email}:${gameId}`, at);
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
  async submit(response: Omit<SurveyResponse, 'createdAt'>): Promise<{ stored: boolean }> {
    const db = getDb();
    if (!db) return { stored: false };
    // RETURNING with ON CONFLICT DO NOTHING only returns a row when the
    // insert actually happened — a conflicted (already-answered) write
    // returns zero rows, which is exactly the "stored: false" signal above.
    const rows = await db`
      INSERT INTO survey_responses (game_id, room_id, room_code, seat, account_email, question_id, answer)
      VALUES (${response.gameId}, ${response.roomId}, ${response.roomCode}, ${response.seat}, ${response.accountEmail}, ${response.questionId}, ${response.answer})
      ON CONFLICT (room_id, seat, question_id) DO NOTHING
      RETURNING id
    `;
    return { stored: rows.length > 0 };
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

  async getLatestResponseAt(gameId: string): Promise<number | null> {
    const db = getDb();
    if (!db) return null;
    try {
      const rows = await db<{ created_at: Date }[]>`
        SELECT created_at FROM survey_responses WHERE game_id = ${gameId} ORDER BY created_at DESC LIMIT 1
      `;
      return rows[0] ? rows[0].created_at.getTime() : null;
    } catch (error) {
      console.error(`[db] failed to read latest survey response time for ${gameId}:`, error);
      return null;
    }
  }

  async getReadAt(email: string, gameId: string): Promise<number | null> {
    const db = getDb();
    if (!db) return null;
    try {
      const rows = await db<{ read_at: Date }[]>`
        SELECT read_at FROM feedback_read_at WHERE email = ${email} AND game_id = ${gameId}
      `;
      return rows[0] ? rows[0].read_at.getTime() : null;
    } catch (error) {
      console.error(`[db] failed to read feedback read time for ${email}/${gameId}:`, error);
      return null;
    }
  }

  async markRead(email: string, gameId: string, at: number): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      await db`
        INSERT INTO feedback_read_at (email, game_id, read_at)
        VALUES (${email}, ${gameId}, to_timestamp(${at / 1000}))
        ON CONFLICT (email, game_id) DO UPDATE SET read_at = EXCLUDED.read_at
      `;
    } catch (error) {
      console.error(`[db] failed to mark feedback read for ${email}/${gameId}:`, error);
    }
  }
}

/** Picks the Postgres-backed repository when Neon is configured, else an in-memory-only fallback. */
export function createDefaultSurveyRepository(): SurveyRepository {
  return getDb() ? new PostgresSurveyRepository() : new InMemorySurveyRepository();
}
