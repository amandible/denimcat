import { loadSessionToken } from './authToken';
import { SERVER_URL } from '../socket';

export interface UnreadFeedback {
  gameId: string;
  displayName: string;
  hasUnread: boolean;
}

/** Owner-only "new feedback" indicator for the home screen — see surveyRoutes.ts's GET /survey-responses. Resolves to [] if signed out, not the owner, or on any error, same fail-soft convention as fetchMyGames. */
export async function fetchUnreadFeedback(): Promise<UnreadFeedback[]> {
  const token = loadSessionToken();
  if (!token) return [];
  try {
    const res = await fetch(`${SERVER_URL}/survey-responses`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return data.ok ? (data.games as UnreadFeedback[]) : [];
  } catch {
    return [];
  }
}

/** Marks this game's notes as read as of now — see NotesView, which calls this once its responses have loaded. */
export async function markFeedbackRead(gameId: string): Promise<void> {
  const token = loadSessionToken();
  if (!token) return;
  try {
    await fetch(`${SERVER_URL}/survey-responses/${gameId}/read`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // Best-effort — a failed mark-as-read just means the indicator stays on; no retry needed for a convenience feature like this.
  }
}
