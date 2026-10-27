import { useState, type ReactNode } from 'react';
import { STANDARD_SURVEY_QUESTIONS } from '@denimcat/shared';
import { loadSessionToken } from '../state/authToken';
import { SERVER_URL } from '../socket';

/**
 * Shown in place of a finished room's normal play UI — the one shared
 * implementation every game uses, same role ActivityPanel plays for
 * logs/chat, rather than each game forking its own ad hoc "game over"
 * text. `resultSummary` is caller-supplied (score, winner) since this
 * component never inspects any particular game's state itself, same
 * extension-point pattern ActivityPanel's `renderLogText` already uses.
 *
 * One seat per instance — `GameView` is always rendered per-seat, even in
 * hotseat mode (see HotseatRoom.tsx: one GameView/connection per seat,
 * shown one at a time or all side by side in split view, never one
 * GameView juggling several seats at once), so "a hotseat player holding
 * 3 seats gets 3 short forms" falls out of that existing architecture —
 * this component itself only ever needs to handle the one seat its own
 * `GameView` instance represents.
 *
 * Submitting is a single bulk POST of whatever questions were actually
 * filled in; a blank question is treated as silently skipped. Server-side
 * submission is a durable, one-shot record — see SurveyRepository.submit's
 * idempotency — so once this seat's form reports "submitted" or "skipped"
 * here, reloading the page won't re-offer it (and neither will a later
 * visit, once the room's recap status clears — see the design doc's
 * "don't nag" constraint).
 */
export function RecapPanel({
  gameId,
  roomCode,
  mySeat,
  resultSummary,
}: {
  gameId: string;
  roomCode: string;
  mySeat: string;
  resultSummary: ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit() {
    const answers = STANDARD_SURVEY_QUESTIONS.map((q) => ({ questionId: q.id, answer: (drafts[q.id] ?? '').trim() })).filter(
      (a) => a.answer.length > 0,
    );
    if (answers.length === 0) {
      setDismissed(true);
      return;
    }
    const token = loadSessionToken();
    if (!token) return;
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch(`${SERVER_URL}/survey-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gameId, roomCode, seat: mySeat, answers }),
      });
      const data = await res.json();
      if (data.ok) setSubmitted(true);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Game over</h3>
      <div style={{ marginBottom: 12 }}>{resultSummary}</div>
      {dismissed || submitted ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>{submitted ? 'Thanks for the feedback!' : 'Skipped.'}</p>
      ) : (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {STANDARD_SURVEY_QUESTIONS.map((q) => (
            <div key={q.id} style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{q.text}</label>
              <input
                value={drafts[q.id] ?? ''}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                style={{ width: '100%', fontSize: 13, padding: '4px 8px' }}
              />
            </div>
          ))}
          {failed && <p style={{ fontSize: 12, color: 'var(--accent)' }}>Something went wrong — try again.</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={saving} onClick={submit} style={{ fontSize: 13 }}>
              Submit
            </button>
            <button className="btn" onClick={() => setDismissed(true)} style={{ fontSize: 13 }}>
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
