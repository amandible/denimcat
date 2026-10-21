import { GAMES } from '../games/registry';
import { invalidateSession, loadSessionToken } from '../state/authToken';
import { SERVER_URL } from '../socket';

async function handleSignOut() {
  const token = loadSessionToken();
  if (token) {
    await fetch(`${SERVER_URL}/auth/sign-out`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
  invalidateSession();
}

export function HomeView() {
  return (
    <main style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
      <div style={{ width: '100%' }}>
        <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
          <a href="/settings" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Settings
          </a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleSignOut(); }} style={{ fontSize: 13, color: 'var(--muted)' }}>
            Sign out
          </a>
        </div>
        <h1 style={{ fontSize: 36, textAlign: 'center' }}>denimcat</h1>
        <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 0 }}>Pick a game to play.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
          {GAMES.map((game) => (
            <a
              key={game.slug}
              href={`/${game.slug}`}
              className="panel"
              style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: 20 }}
            >
              <h2 style={{ margin: 0, fontSize: 20 }}>{game.displayName}</h2>
              <p style={{ color: 'var(--muted)', margin: '6px 0 0' }}>{game.tagline}</p>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
