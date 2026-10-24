import { useEffect, useState } from 'react';
import { GAMES } from '../games/registry';
import { invalidateSession, loadSessionToken } from '../state/authToken';
import { abandonMyGame, fetchMyGames, formatRelativeAge, myGameUrl, type MyGame } from '../state/myGames';
import { SERVER_URL } from '../socket';

async function handleSignOut() {
  const token = loadSessionToken();
  if (token) {
    await fetch(`${SERVER_URL}/auth/sign-out`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
  invalidateSession();
}

export function HomeView() {
  const [myGames, setMyGames] = useState<MyGame[]>([]);

  useEffect(() => {
    fetchMyGames().then(setMyGames);
  }, []);

  async function handleAbandon(game: MyGame) {
    if (!window.confirm(`Abandon this ${game.displayName} game (room ${game.code})? This can't be undone.`)) return;
    const ok = await abandonMyGame(game);
    if (ok) {
      setMyGames((prev) => prev.filter((g) => !(g.gameId === game.gameId && g.code === game.code)));
    } else {
      // Conditions changed since the list was fetched (e.g. someone just joined) — refetch to reflect reality.
      fetchMyGames().then(setMyGames);
    }
  }

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

        {myGames.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
            <h2 style={{ fontSize: 15, color: 'var(--muted)', margin: 0 }}>Your games</h2>
            {myGames.map((game) => (
              <div
                key={`${game.gameId}-${game.code}`}
                className="panel"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 18px' }}
              >
                <a href={myGameUrl(game)} style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}>
                  <div>
                    {game.displayName} <span style={{ color: 'var(--muted)', fontSize: 13 }}>· room {game.code}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                    {game.otherPlayerNames.length > 0 && `vs ${game.otherPlayerNames.join(', ')} · `}
                    Created {formatRelativeAge(game.createdAt)}
                  </div>
                </a>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <strong style={{ color: game.isMyTurn ? 'var(--accent)' : 'var(--muted)', fontSize: 13 }}>
                    {game.isMyTurn ? 'Your turn' : 'Waiting'}
                  </strong>
                  {game.abandonable && (
                    <button className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => handleAbandon(game)}>
                      Abandon
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

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
