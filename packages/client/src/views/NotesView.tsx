import { useEffect, useState } from 'react';
import { STANDARD_SURVEY_QUESTIONS, type SurveyResponse } from '@denimcat/shared';
import { loadSessionToken } from '../state/authToken';
import { markFeedbackRead } from '../state/feedback';
import { playerLabel } from '../playerLabel';
import { SERVER_URL } from '../socket';

const QUESTION_TEXT: Record<string, string> = Object.fromEntries(STANDARD_SURVEY_QUESTIONS.map((q) => [q.id, q.text]));

/**
 * Owner-only playtest feedback, one page per game, aggregating every
 * response ever submitted across every room that game has been played
 * in — see SurveyResponse.roomId's doc comment for why this outlives any
 * individual room. Deliberately not styled beyond basic readability; the
 * payoff here is having everything in one place, not how it looks.
 * `GET /survey-responses/:gameId` is itself the real access-control
 * boundary (see AuthService.isOwner) — this page being reachable at all
 * is not a security measure, just a convenience for the one person it's
 * ever meant to be useful to.
 */
export function NotesView({ gameId }: { gameId: string }) {
  const [responses, setResponses] = useState<SurveyResponse[] | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    const token = loadSessionToken();
    if (!token) {
      setForbidden(true);
      return;
    }
    fetch(`${SERVER_URL}/survey-responses/${gameId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data: { ok: true; responses: SurveyResponse[] } | { ok: false }) => {
        if (data.ok) {
          setResponses(data.responses);
          // Marks read now that the responses that exist as of this load
          // have actually been shown — see HomeView's "new feedback" row,
          // which this clears. Fire-and-forget: a failure here just leaves
          // the indicator on, not worth blocking or retrying for.
          markFeedbackRead(gameId);
        } else {
          setForbidden(true);
        }
      })
      .catch(() => setForbidden(true));
  }, [gameId]);

  if (forbidden) {
    return (
      <main style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
        <p>You don't have access to this page.</p>
      </main>
    );
  }
  if (!responses) {
    return (
      <main style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </main>
    );
  }

  // Already newest-first from the server — grouping in that same order
  // means the first room we see for a given roomId is its most recent
  // activity, which is what "most recently active room first" should mean.
  const roomOrder: string[] = [];
  const byRoom = new Map<string, SurveyResponse[]>();
  for (const r of responses) {
    if (!byRoom.has(r.roomId)) {
      byRoom.set(r.roomId, []);
      roomOrder.push(r.roomId);
    }
    byRoom.get(r.roomId)!.push(r);
  }

  return (
    <main style={{ maxWidth: 700, margin: '40px auto', padding: '0 16px' }}>
      <h1>Playtest notes — {gameId}</h1>
      {roomOrder.length === 0 && <p style={{ color: 'var(--muted)' }}>No feedback yet.</p>}
      {roomOrder.map((roomId) => {
        const rows = byRoom.get(roomId)!;
        return (
          <div key={roomId} className="panel" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Room {rows[0].roomCode}</h3>
            {rows.map((r, i) => (
              <p key={i} style={{ margin: '8px 0' }}>
                <strong>
                  {/* questionId shown alongside the text as a stable reference — question wording can
                      change over time (see StandardSurveyQuestion's doc comment), but an already-submitted
                      answer keeps the id it was recorded under. */}
                  {playerLabel(r.playerName, r.positionLabel)} — {QUESTION_TEXT[r.questionId] ?? r.questionId} ({r.questionId})
                </strong>
                <br />
                {r.answer}
              </p>
            ))}
          </div>
        );
      })}
    </main>
  );
}
