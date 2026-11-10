import { useState, type FormEvent } from 'react';
import { SERVER_URL } from '../socket';

/**
 * Site-wide magic-link sign-in gate — shown instead of any game UI
 * whenever there's no valid session (see App.tsx). Open self-serve signup:
 * any email can request a link; there's nothing to distinguish a known vs.
 * unknown address here, since /auth/request-link always behaves the same
 * either way.
 */
export function SignInGate() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  // Only ever set when the server's EmailSender is the noop one (local
  // dev, tests, CI — see AuthService.requestLink) — nothing is actually
  // emailed anywhere in that case, so this is the only way to get the
  // link at all without digging through server logs.
  const [devLink, setDevLink] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${SERVER_URL}/auth/request-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data: { ok: true; devLink?: string } = await res.json();
      setDevLink(data.devLink ?? null);
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
      <div className="panel" style={{ width: '100%' }}>
        <h1 style={{ fontSize: 28 }}>denimcat</h1>
        {sent ? (
          devLink ? (
            <>
              <p style={{ color: 'var(--muted)' }}>
                No email sender is configured locally, so nothing was actually sent — click below to sign in instead:
              </p>
              <a href={devLink} className="btn btn-primary" style={{ display: 'block', textAlign: 'center', padding: 12 }}>
                Sign in now (dev)
              </a>
            </>
          ) : (
            <p style={{ color: 'var(--muted)' }}>
              Check your email for a sign-in link. It's good for about 20 minutes.
            </p>
          )
        ) : (
          <>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>Enter your email address - you'll receive a sign-in link.</p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ flex: 1, padding: 12, fontSize: 16, border: '1px solid var(--border)', borderRadius: 8 }}
              />
              <button className="btn btn-primary" type="submit" disabled={busy} style={{ padding: '12px 16px', fontSize: 16 }}>
                Send link
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
