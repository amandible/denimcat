import { GAMES } from '../games/registry';

export function HomeView() {
  return (
    <main style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
      <div style={{ width: '100%' }}>
        <h1 style={{ fontSize: 36, textAlign: 'center' }}>denimcat</h1>
        <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 0 }}>Pick a game to play with friends.</p>
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
