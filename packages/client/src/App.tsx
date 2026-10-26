import { useEffect, useState } from 'react';
import { HomeView } from './views/HomeView';
import { SignInGate } from './views/SignInGate';
import { VerifyView } from './views/VerifyView';
import { SettingsView } from './views/SettingsView';
import { HyperBloomHomeView } from '../../../private-games/other-games/client-hyperbloom/HomeView';
import { MintConditionHomeView } from './games/mint-condition/HomeView';
import { LoveTrianglesHomeView } from './games/love-triangles/HomeView';
import { TashKalarHomeView } from '../../../private-games/other-games/client-tashkalar/HomeView';
import { KingsGateHomeView } from '../../../private-games/other-games/client-kingsgate/HomeView';
import { HyperBloomRoom } from '../../../private-games/other-games/client-hyperbloom/HyperBloomRoom';
import { MintConditionRoom } from './games/mint-condition/MintConditionRoom';
import { LoveTrianglesRoom } from './games/love-triangles/LoveTrianglesRoom';
import { TashKalarRoom } from '../../../private-games/other-games/client-tashkalar/TashKalarRoom';
import { KingsGateRoom } from '../../../private-games/other-games/client-kingsgate/KingsGateRoom';
import { loadSessionToken, onSessionInvalidated, saveIdentity } from './state/authToken';
import { SERVER_URL } from './socket';
import { Footer } from './components/Footer';

type Slug = 'hyperbloom' | 'mint-condition' | 'love-triangles' | 'tashkalar' | 'kingsgate';

type Route =
  | { kind: 'home' }
  | { kind: 'game-home'; slug: Slug }
  | { kind: 'room'; slug: Slug; roomCode: string }
  | { kind: 'auth-verify'; token: string }
  | { kind: 'settings' };

function parseRoute(): Route {
  const path = window.location.pathname;
  const roomMatch = path.match(/^\/(hyperbloom|mint-condition|love-triangles|tashkalar|kingsgate)\/room\/([A-Za-z0-9]{4})$/);
  if (roomMatch) {
    return { kind: 'room', slug: roomMatch[1] as Slug, roomCode: roomMatch[2].toUpperCase() };
  }
  const gameMatch = path.match(/^\/(hyperbloom|mint-condition|love-triangles|tashkalar|kingsgate)\/?$/);
  if (gameMatch) {
    return { kind: 'game-home', slug: gameMatch[1] as Slug };
  }
  if (path === '/auth/verify') {
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) return { kind: 'auth-verify', token };
  }
  if (path === '/settings') return { kind: 'settings' };
  return { kind: 'home' };
}

const HOME_VIEWS: Record<Slug, () => JSX.Element> = {
  hyperbloom: HyperBloomHomeView,
  'mint-condition': MintConditionHomeView,
  'love-triangles': LoveTrianglesHomeView,
  tashkalar: TashKalarHomeView,
  kingsgate: KingsGateHomeView,
};

const ROOM_VIEWS: Record<Slug, (props: { roomCode: string }) => JSX.Element> = {
  hyperbloom: HyperBloomRoom,
  'mint-condition': MintConditionRoom,
  'love-triangles': LoveTrianglesRoom,
  tashkalar: TashKalarRoom,
  kingsgate: KingsGateRoom,
};

type SessionState = 'checking' | 'signed-out' | 'signed-in';

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute());
  const [session, setSession] = useState<SessionState>('checking');

  useEffect(() => {
    function onPopState() {
      setRoute(parseRoute());
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // One-time check on load: is the stored session token (if any) still
  // valid? Handles revocation/expiry gracefully rather than trusting
  // localStorage's mere presence. Timed out via AbortController rather than
  // left to hang indefinitely — a slow/unresponsive server (e.g. mid-restart
  // during a deploy) would otherwise leave `session` stuck on 'checking'
  // forever, which renders as a blank page with no way out short of another
  // reload.
  useEffect(() => {
    const token = loadSessionToken();
    if (!token) {
      setSession('signed-out');
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    fetch(`${SERVER_URL}/auth/session`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then((res) => res.json())
      .then((result: { ok: true; email: string; displayName: string | null; turnChimeEnabled: boolean } | { ok: false }) => {
        if (result.ok) saveIdentity(result.email, result.displayName, result.turnChimeEnabled);
        setSession(result.ok ? 'signed-in' : 'signed-out');
      })
      .catch(() => setSession('signed-out'))
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  // A game socket's auth middleware rejected our session (expired/revoked
  // elsewhere) — drop back to the sign-in gate immediately rather than
  // waiting for the next full reload.
  useEffect(() => onSessionInvalidated(() => setSession('signed-out')), []);

  function handleVerified() {
    window.history.replaceState(null, '', '/');
    setSession('signed-in');
    setRoute({ kind: 'home' });
  }

  // The verify route must be reachable while signed-out, by definition —
  // it's how signing in actually happens — so it's checked before the
  // session-gate early-returns below.
  function renderRoute() {
    if (route.kind === 'auth-verify') return <VerifyView token={route.token} onVerified={handleVerified} />;
    if (session === 'checking') {
      return (
        <main style={{ maxWidth: 420, margin: '0 auto', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
          <p style={{ color: 'var(--muted)' }}>Loading…</p>
        </main>
      );
    }
    if (session === 'signed-out') return <SignInGate />;

    if (route.kind === 'home') return <HomeView />;
    if (route.kind === 'settings') return <SettingsView />;
    if (route.kind === 'game-home') {
      const GameHome = HOME_VIEWS[route.slug];
      return <GameHome />;
    }
    const Room = ROOM_VIEWS[route.slug];
    return <Room roomCode={route.roomCode} />;
  }

  return (
    <>
      {renderRoute()}
      <Footer />
    </>
  );
}
