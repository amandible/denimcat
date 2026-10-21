import { useEffect, useRef, useState } from 'react';
import { SERVER_URL } from '../socket';
import { saveIdentity, saveSessionToken } from '../state/authToken';

type VerifyStatus = 'verifying' | 'invalid';

/**
 * Landing page for a clicked magic-link email (`/auth/verify?token=...`).
 * `token` comes from App.tsx's parseRoute, which already stripped it from
 * the visible URL (mirroring consumeReconnectLinkParams's exact pattern in
 * useRoomConnection.ts) before this ever renders.
 */
export function VerifyView({ token, onVerified }: { token: string; onVerified: () => void }) {
  const [status, setStatus] = useState<VerifyStatus>('verifying');
  // StrictMode double-invokes effects in dev (mount -> cleanup -> mount
  // again) to surface missing cleanup logic. This guard makes sure the
  // single-use /auth/verify token is only ever POSTed once regardless.
  // (A `cancelled`-on-cleanup flag doesn't work here: React calls the
  // first invocation's cleanup as part of that same synthetic dance, which
  // would discard its own — the only — real response as "stale".)
  const firedForToken = useRef<string | null>(null);

  useEffect(() => {
    if (firedForToken.current === token) return;
    firedForToken.current = token;
    fetch(`${SERVER_URL}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((result: { ok: true; sessionToken: string; email: string; displayName: string | null } | { ok: false }) => {
        if (result.ok) {
          saveSessionToken(result.sessionToken);
          saveIdentity(result.email, result.displayName);
          onVerified();
        } else {
          setStatus('invalid');
        }
      })
      .catch(() => setStatus('invalid'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
      <div className="panel" style={{ width: '100%', textAlign: 'center' }}>
        {status === 'verifying' ? (
          <p>Verifying your sign-in link…</p>
        ) : (
          <>
            <p>This link is invalid or has expired.</p>
            <a href="/">Request a new one</a>
          </>
        )}
      </div>
    </main>
  );
}
