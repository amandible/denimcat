import { useEffect, useState } from 'react';
import { HomeView } from './views/HomeView';
import { HyperBloomHomeView } from './games/hyperbloom/HomeView';
import { MintConditionHomeView } from './games/mint-condition/HomeView';
import { HyperBloomRoom } from './games/hyperbloom/HyperBloomRoom';
import { MintConditionRoom } from './games/mint-condition/MintConditionRoom';

type Route =
  | { kind: 'home' }
  | { kind: 'game-home'; slug: 'hyperbloom' | 'mint-condition' }
  | { kind: 'room'; slug: 'hyperbloom' | 'mint-condition'; roomCode: string };

function parseRoute(): Route {
  const path = window.location.pathname;
  const roomMatch = path.match(/^\/(hyperbloom|mint-condition)\/room\/([A-Za-z0-9]{4})$/);
  if (roomMatch) {
    return { kind: 'room', slug: roomMatch[1] as 'hyperbloom' | 'mint-condition', roomCode: roomMatch[2].toUpperCase() };
  }
  const gameMatch = path.match(/^\/(hyperbloom|mint-condition)\/?$/);
  if (gameMatch) {
    return { kind: 'game-home', slug: gameMatch[1] as 'hyperbloom' | 'mint-condition' };
  }
  return { kind: 'home' };
}

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute());

  useEffect(() => {
    function onPopState() {
      setRoute(parseRoute());
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (route.kind === 'home') return <HomeView />;
  if (route.kind === 'game-home') {
    return route.slug === 'hyperbloom' ? <HyperBloomHomeView /> : <MintConditionHomeView />;
  }
  return route.slug === 'hyperbloom' ? (
    <HyperBloomRoom roomCode={route.roomCode} />
  ) : (
    <MintConditionRoom roomCode={route.roomCode} />
  );
}
