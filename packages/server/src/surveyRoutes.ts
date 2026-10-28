import { Router } from 'express';
import cors from 'cors';
import { isNonEmptyString, type AuthService, type SurveyRepository } from '@denimcat/platform';
import { STANDARD_SURVEY_QUESTIONS } from '@denimcat/shared';
import type { GameStoreEntry } from './myGamesRoutes';

const MAX_ANSWER_LENGTH = 2000;
const QUESTION_IDS = new Set(STANDARD_SURVEY_QUESTIONS.map((q) => q.id));

function bearerToken(req: { headers: { authorization?: string } }): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);
  return token.length > 0 ? token : null;
}

function isValidAnswers(answers: unknown): answers is { questionId: string; answer: string }[] {
  if (!Array.isArray(answers) || answers.length === 0) return false;
  return answers.every(
    (a) =>
      a &&
      typeof a === 'object' &&
      isNonEmptyString((a as { questionId?: unknown }).questionId) &&
      QUESTION_IDS.has((a as { questionId: string }).questionId) &&
      isNonEmptyString((a as { answer?: unknown }).answer) &&
      (a as { answer: string }).answer.length <= MAX_ANSWER_LENGTH,
  );
}

/**
 * Post-game recap feedback: submitting an answer (open to any seat-holder,
 * once their room has finished) and reading every answer ever given for a
 * game (owner-only — the first actual access-control boundary in this app,
 * see AuthService.isOwner). Mounted at /survey-responses.
 */
export function surveyRouter(authService: AuthService, gameStores: GameStoreEntry[], surveyRepository: SurveyRepository, clientOrigins: string[]): Router {
  const router = Router();
  router.use(cors({ origin: clientOrigins.length > 0 ? clientOrigins : '*' }));

  router.post('/', async (req, res) => {
    const token = bearerToken(req);
    const gameId = req.body?.gameId;
    const roomCode = req.body?.roomCode;
    const seat = req.body?.seat;
    const answers = req.body?.answers;
    if (!token || !isNonEmptyString(gameId) || !isNonEmptyString(roomCode) || !isNonEmptyString(seat) || !isValidAnswers(answers)) {
      res.json({ ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Malformed request.' } });
      return;
    }
    const session = await authService.checkSession(token);
    if (!session) {
      res.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Not signed in.' } });
      return;
    }
    const entry = gameStores.find((g) => g.module.id === gameId);
    if (!entry) {
      res.json({ ok: false, error: { code: 'UNKNOWN_GAME', message: 'No such game.' } });
      return;
    }
    const room = await entry.store.getRoom(roomCode);
    if (!room) {
      res.json({ ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'No such room.' } });
      return;
    }
    if (!entry.module.isRoomFinished?.(room.gameState)) {
      res.json({ ok: false, error: { code: 'NOT_FINISHED', message: 'This game has not ended yet.' } });
      return;
    }
    if (room.knownAccounts[seat] !== session.email) {
      res.json({ ok: false, error: { code: 'NOT_YOUR_SEAT', message: 'You do not hold that seat in this room.' } });
      return;
    }

    const results = await Promise.all(
      answers.map(async (a) => {
        const { stored } = await surveyRepository.submit({
          gameId,
          roomId: room.roomId,
          roomCode: room.code,
          seat,
          accountEmail: session.email,
          questionId: a.questionId,
          answer: a.answer.trim(),
        });
        return { questionId: a.questionId, stored };
      }),
    );
    // A question that already had an answer on file is NOT silently
    // overwritten (see SurveyRepository.submit's idempotency) — reported
    // back so the client never shows "thanks for the feedback" for an
    // answer that was actually discarded.
    const alreadyAnswered = results.filter((r) => !r.stored).map((r) => r.questionId);
    res.json({ ok: true, alreadyAnswered });
  });

  router.get('/:gameId', async (req, res) => {
    const token = bearerToken(req);
    if (!token) {
      res.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Not signed in.' } });
      return;
    }
    const session = await authService.checkSession(token);
    if (!session?.isOwner) {
      res.json({ ok: false, error: { code: 'FORBIDDEN', message: 'Owner only.' } });
      return;
    }
    const responses = await surveyRepository.listForGame(req.params.gameId);
    res.json({ ok: true, responses });
  });

  return router;
}
