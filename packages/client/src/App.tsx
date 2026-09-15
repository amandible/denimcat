import { useEffect, useState } from 'react';
import { HomeView } from './views/HomeView';
import { HyperBloomHomeView } from '../../../private-games/other-games/client-hyperbloom/HomeView';
import { MintConditionHomeView } from './games/mint-condition/HomeView';
import { LoveTrianglesHomeView } from './games/love-triangles/HomeView';
import { TashKalarHomeView } from '../../../private-games/other-games/client-tashkalar/HomeView';
import { HyperBloomRoom } from '../../../private-games/other-games/client-hyperbloom/HyperBloomRoom';
import { MintConditionRoom } from './games/mint-condition/MintConditionRoom';
import { LoveTrianglesRoom } from './games/love-triangles/LoveTrianglesRoom';
import { TashKalarRoom } from '../../../private-games/other-games/client-tashkalar/TashKalarRoom';

type Slug = 'hyperbloom' | 'mint-condition' | 'love-triangles' | 'tashkalar';

type Route = { kind: 'home' } | { kind: 'game-home'; slug: Slug } | { kind: 'room'; slug: Slug; roomCode: string };

function parseRoute(): Route {
  const path = window.location.pathname;
  const roomMatch = path.match(/^\/(hyperbloom|mint-condition|love-triangles|tashkalar)\/room\/([A-Za-z0-9]{4})$/);
  if (roomMatch) {
    return { kind: 'room', slug: roomMatch[1] as Slug, roomCode: roomMatch[2].toUpperCase() };
  }
  const gameMatch = path.match(/^\/(hyperbloom|mint-condition|love-triangles|tashkalar)\/?$/);
  if (gameMatch) {
    return { kind: 'game-home', slug: gameMatch[1] as Slug };
  }
  return { kind: 'home' };
}

const HOME_VIEWS: Record<Slug, () => JSX.Element> = {
  hyperbloom: HyperBloomHomeView,
  'mint-condition': MintConditionHomeView,
  'love-triangles': LoveTrianglesHomeView,
  tashkalar: TashKalarHomeView,
};

const ROOM_VIEWS: Record<Slug, (props: { roomCode: string }) => JSX.Element> = {
  hyperbloom: HyperBloomRoom,
  'mint-condition': MintConditionRoom,
  'love-triangles': LoveTrianglesRoom,
  tashkalar: TashKalarRoom,
};

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
    const GameHome = HOME_VIEWS[route.slug];
    return <GameHome />;
  }
  const Room = ROOM_VIEWS[route.slug];
  return <Room roomCode={route.roomCode} />;
}
