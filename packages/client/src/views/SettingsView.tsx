import { useState, type FormEvent } from 'react';
import { SERVER_URL } from '../socket';
import { loadAuthEmail, loadDisplayName, loadSessionToken, saveIdentity } from '../state/authToken';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Minimal account settings: just a display name for now, pre-filled from
 * the cached profile. Saving it here is what lets LobbyView default its
 * per-room "your name" field without asking again every time.
 */
export function SettingsView() {
  const [displayName, setDisplayName] = useState(loadDisplayName() ?? '');
  const [status, setStatus] = useState<SaveStatus>('idle');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = loadSessionToken();
    if (!token) return;
    setStatus('saving');
    fetch(`${SERVER_URL}/auth/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName }),
    })
      .then((res) => res.json())
      .then((result: { ok: true; displayName: string } | { ok: false }) => {
        if (!result.ok) {
          setStatus('error');
          return;
        }
        setDisplayName(result.displayName);
        const email = loadAuthEmail();
        if (email) saveIdentity(email, result.displayName);
        setStatus('saved');
      })
      .catch(() => setStatus('error'));
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
      <div className="panel" style={{ width: '100%' }}>
        <a href="/" style={{ fontSize: 13, color: 'var(--muted)' }}>
          ← Back
        </a>
        <h1 style={{ fontSize: 28, marginTop: 8 }}>Settings</h1>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setStatus('idle');
              }}
              placeholder="e.g. Alex"
              maxLength={40}
              style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid var(--border)', borderRadius: 8 }}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={status === 'saving'} style={{ padding: 12, fontSize: 16 }}>
            Save
          </button>
          {status === 'saved' && <p style={{ color: 'var(--accent)' }}>Saved.</p>}
          {status === 'error' && <p style={{ color: 'crimson' }}>Couldn't save — try again.</p>}
        </form>
      </div>
    </main>
  );
}
