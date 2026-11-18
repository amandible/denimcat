import { useEffect, useState } from 'react';
import { HomeView } from './views/HomeView';
import { SignInGate } from './views/SignInGate';
import { VerifyView } from './views/VerifyView';
import { SettingsView } from './views/SettingsView';
import { NotesView } from './views/NotesView';
import { HyperBloomHomeView } from '../../../private-games/other-games/client-hyperbloom/HomeView';
import { MintConditionHomeView } from './games/mint-condition/HomeView';
import { LoveTrianglesHomeView } from './games/love-triangles/HomeView';
import { DetourHomeView } from './games/detour/HomeView';
import { TashKalarHomeView } from '../../../private-games/other-games/client-tashkalar/HomeView';
import { KingsGateHomeView } from '../../../private-games/other-games/client-kingsgate/HomeView';
import { HyperBloomRoom } from '../../../private-games/other-games/client-hyperbloom/HyperBloomRoom';
import { MintConditionRoom } from './games/mint-condition/MintConditionRoom';
import { LoveTrianglesRoom } from './games/love-triangles/LoveTrianglesRoom';
import { DetourRoom } from './games/detour/DetourRoom';
import { TashKalarRoom } from '../../../private-games/other-games/client-tashkalar/TashKalarRoom';
import { KingsGateRoom } from '../../../private-games/other-games/client-kingsgate/KingsGateRoom';
import { loadSessionToken, onSessionInvalidated, saveIdentity } from './state/authToken';
import { Footer } from './components/Footer';
import { checkSessionWithRetry, fetchSessionOnce } from './state/sessionCheck';
import { parseRoute, type Route, type Slug } from './routes';

const HOME_VIEWS: Record<Slug, () => JSX.Element> = {
  hyperbloom: HyperBloomHomeView,
  'mint-condition': MintConditionHomeView,
  'love-triangles': LoveTrianglesHomeView,
  detour: DetourHomeView,
  tashkalar: TashKalarHomeView,
  kingsgate: KingsGateHomeView,
};

const ROOM_VIEWS: Record<Slug, (props: { roomCode: string }) => JSX.Element> = {
  hyperbloom: HyperBloomRoom,
  'mint-condition': MintConditionRoom,
  'love-triangles': LoveTrianglesRoom,
  detour: DetourRoom,
  tashkalar: TashKalarRoom,
  kingsgate: KingsGateRoom,
};

type SessionState = 'checking' | 'waking' | 'unreachable' | 'signed-out' | 'signed-in';

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname, window.location.search));
  const [session, setSession] = useState<SessionState>('checking');
  // Bumped by the "Try again" button to re-run the session check.
  const [sessionCheckRun, setSessionCheckRun] = useState(0);

  useEffect(() => {
    function onPopState() {
      setRoute(parseRoute(window.location.pathname, window.location.search));
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Check on load: is the stored session token (if any) still valid?
  // Handles revocation/expiry rather than trusting localStorage's mere
  // presence. A server that can't be reached (a Fly machine cold-starting,
  // a deploy mid-restart) is retried with a "waking up" notice instead of
  // being mistaken for "signed out" — see checkSessionWithRetry.
  useEffect(() => {
    const token = loadSessionToken();
    if (!token) {
      setSession('signed-out');
      return;
    }
    setSession('checking');
    const controller = new AbortController();
    checkSessionWithRetry(fetchSessionOnce(token, controller.signal), {
      onWaiting: () => setSession('waking'),
      isCancelled: () => controller.signal.aborted,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.kind === 'signed-in') {
        const { email, displayName, turnChimeEnabled, isOwner } = result.identity;
        saveIdentity(email, displayName, turnChimeEnabled, isOwner);
      }
      setSession(result.kind);
    });
    return () => controller.abort();
  }, [sessionCheckRun]);

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
    if (session === 'checking' || session === 'waking' || session === 'unreachable') {
      return (
        <main style={{ maxWidth: 420, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 16px' }}>
          {session === 'checking' && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
          {session === 'waking' && <p style={{ color: 'var(--muted)' }}>Waking up the server — this can take a few seconds…</p>}
          {session === 'unreachable' && (
            <>
              <p>Can't reach the server right now.</p>
              <button type="button" className="btn btn-primary" onClick={() => setSessionCheckRun((n) => n + 1)}>
                Try again
              </button>
            </>
          )}
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
    if (route.kind === 'game-notes') {
      return <NotesView gameId={route.slug} />;
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
