import { SERVER_URL } from '../socket';

export type SessionIdentity = { ok: true; email: string; displayName: string | null; turnChimeEnabled: boolean; isOwner: boolean };

/** One /auth/session call. Throws when the server can't be reached at all (network error, timeout). */
export type SessionFetch = () => Promise<SessionIdentity | { ok: false }>;

export type SessionCheckResult = { kind: 'signed-in'; identity: SessionIdentity } | { kind: 'signed-out' } | { kind: 'unreachable' };

const PER_ATTEMPT_TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 2000;
/** ~8 attempts × (up to 8s + 2s) — comfortably longer than a Fly machine's cold start. */
const DEFAULT_MAX_ATTEMPTS = 8;

export function fetchSessionOnce(token: string, signal: AbortSignal): SessionFetch {
  return async () => {
    // A plain AbortController rather than AbortSignal.any/timeout, which
    // older Safari lacks — there, every attempt would throw and read as
    // "unreachable", locking the player out entirely.
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, PER_ATTEMPT_TIMEOUT_MS);
    signal.addEventListener('abort', abort);
    try {
      const res = await fetch(`${SERVER_URL}/auth/session`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      return await res.json();
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  };
}

/**
 * Checks the stored session, distinguishing "the server says you're not
 * signed in" (signed-out) from "the server couldn't be reached" — the
 * latter is the normal case while a stopped Fly machine cold-starts, and
 * used to drop a perfectly signed-in player onto the sign-in screen.
 * Unreachable is retried; `onWaiting` fires once, on the first failure, so
 * the UI can say the server is waking up. A caller that abandons the check
 * (component unmount) should abort the signal behind `fetchSession`.
 */
export async function checkSessionWithRetry(
  fetchSession: SessionFetch,
  options: { maxAttempts?: number; sleep?: (ms: number) => Promise<void>; onWaiting?: () => void; isCancelled?: () => boolean } = {},
): Promise<SessionCheckResult> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fetchSession();
      return result.ok ? { kind: 'signed-in', identity: result } : { kind: 'signed-out' };
    } catch {
      if (options.isCancelled?.()) return { kind: 'unreachable' };
      if (attempt === 1) options.onWaiting?.();
      if (attempt < maxAttempts) await sleep(RETRY_DELAY_MS);
    }
  }
  return { kind: 'unreachable' };
}
