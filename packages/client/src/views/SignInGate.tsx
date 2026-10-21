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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch(`${SERVER_URL}/auth/request-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
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
          <p style={{ color: 'var(--muted)' }}>
            Check your email for a sign-in link. It's good for about 20 minutes.
          </p>
        ) : (
          <>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>Enter your email and we'll send you a sign-in link.</p>
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
