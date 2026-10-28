import { useState, type ReactNode } from 'react';
import { STANDARD_SURVEY_QUESTIONS } from '@denimcat/shared';
import { loadSessionToken } from '../state/authToken';
import { SERVER_URL } from '../socket';

type SubmitState = { kind: 'idle' } | { kind: 'dismissed' } | { kind: 'submitted'; allNew: boolean } | { kind: 'failed' };

/**
 * Shown in place of a finished room's normal play UI — the one shared
 * implementation every game uses, same role ActivityPanel plays for
 * logs/chat, rather than each game forking its own ad hoc "game over"
 * text. `resultSummary` is caller-supplied (score, winner) since this
 * component never inspects any particular game's state itself, same
 * extension-point pattern ActivityPanel's `renderLogText` already uses.
 *
 * `resultSummary` always renders, even for a spectator (`mySeat` omitted)
 * — watching a game to the end and then seeing nothing is worse than a
 * player never being offered the survey at all. Only the feedback form
 * itself is gated on holding a seat.
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
 * filled in; a blank question is treated as silently skipped. The server
 * reports back which questions it actually stored vs. which were already
 * on file (see SurveyRepository.submit's idempotency) — a question
 * already answered is never silently overwritten, so this never claims
 * "thanks for the feedback" for an answer that was actually discarded.
 */
export function RecapPanel({
  gameId,
  roomCode,
  mySeat,
  /** My seat's resolved position label (e.g. "Red", "Sylvan", "Player 1") at submission time — see SurveyResponse.positionLabel's doc comment for why this is captured as plain text rather than resolved later. Required whenever `mySeat` is set (the only case it's ever actually sent). */
  myPositionLabel,
  resultSummary,
}: {
  gameId: string;
  roomCode: string;
  /** Null/omitted for a spectator — resultSummary still shows, but no form. */
  mySeat?: string | null;
  myPositionLabel?: string;
  resultSummary: ReactNode;
}) {
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!mySeat || !myPositionLabel) return;
    const answers = STANDARD_SURVEY_QUESTIONS.map((q) => ({ questionId: q.id, answer: (drafts[q.id] ?? '').trim() })).filter(
      (a) => a.answer.length > 0,
    );
    if (answers.length === 0) {
      setState({ kind: 'dismissed' });
      return;
    }
    const token = loadSessionToken();
    if (!token) {
      setState({ kind: 'failed' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${SERVER_URL}/survey-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gameId, roomCode, seat: mySeat, positionLabel: myPositionLabel, answers }),
      });
      const data: { ok: true; alreadyAnswered: string[] } | { ok: false } = await res.json();
      if (!data.ok) {
        setState({ kind: 'failed' });
        return;
      }
      setState({ kind: 'submitted', allNew: data.alreadyAnswered.length === 0 });
    } catch {
      setState({ kind: 'failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Game over</h3>
      <div style={{ marginBottom: 12 }}>{resultSummary}</div>
      {mySeat &&
        (state.kind === 'dismissed' || state.kind === 'submitted' ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            {state.kind === 'submitted'
              ? state.allNew
                ? 'Thanks for the feedback!'
                : 'Thanks! (Some of these were already on file and were left unchanged.)'
              : 'Skipped.'}
          </p>
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
            {state.kind === 'failed' && <p style={{ fontSize: 12, color: 'var(--accent)' }}>Something went wrong — try again.</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={saving} onClick={submit} style={{ fontSize: 13 }}>
                Submit
              </button>
              <button className="btn" onClick={() => setState({ kind: 'dismissed' })} style={{ fontSize: 13 }}>
                Skip
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
