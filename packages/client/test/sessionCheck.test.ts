import { describe, expect, it } from 'vitest';
import { checkSessionWithRetry, type SessionFetch } from '../src/state/sessionCheck';

const identity = { ok: true as const, email: 'a@example.com', displayName: null, turnChimeEnabled: true, isOwner: false };
const noSleep = async () => {};

function scripted(...outcomes: ('down' | 'signed-in' | 'signed-out')[]): SessionFetch & { calls: number } {
  const fn = (async () => {
    const outcome = outcomes[Math.min(fn.calls, outcomes.length - 1)];
    fn.calls++;
    if (outcome === 'down') throw new Error('network error');
    return outcome === 'signed-in' ? identity : { ok: false as const };
  }) as SessionFetch & { calls: number };
  fn.calls = 0;
  return fn;
}

describe('checkSessionWithRetry', () => {
  it('returns signed-in straight away when the server answers', async () => {
    const fetchSession = scripted('signed-in');
    expect(await checkSessionWithRetry(fetchSession, { sleep: noSleep })).toEqual({ kind: 'signed-in', identity });
    expect(fetchSession.calls).toBe(1);
  });

  it('treats an explicit "not signed in" answer as signed-out without retrying', async () => {
    const fetchSession = scripted('signed-out');
    expect(await checkSessionWithRetry(fetchSession, { sleep: noSleep })).toEqual({ kind: 'signed-out' });
    expect(fetchSession.calls).toBe(1);
  });

  it('retries while the server is unreachable (e.g. a cold start), telling the caller it is waiting', async () => {
    const fetchSession = scripted('down', 'down', 'signed-in');
    let waitingNotices = 0;
    const result = await checkSessionWithRetry(fetchSession, { sleep: noSleep, onWaiting: () => waitingNotices++ });
    expect(result).toEqual({ kind: 'signed-in', identity });
    expect(fetchSession.calls).toBe(3);
    expect(waitingNotices).toBe(1);
  });

  it('gives up as unreachable — never as signed-out — after the attempt limit', async () => {
    const fetchSession = scripted('down');
    expect(await checkSessionWithRetry(fetchSession, { sleep: noSleep, maxAttempts: 4 })).toEqual({ kind: 'unreachable' });
    expect(fetchSession.calls).toBe(4);
  });
});
