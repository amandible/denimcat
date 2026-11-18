/**
 * Every game the client can route to — the single list the route patterns
 * below and App.tsx's HOME_VIEWS/ROOM_VIEWS maps (typed Record<Slug, …>,
 * so TypeScript flags a missing entry) are all derived from. Deliberately
 * separate from games/registry.ts's GAMES: that's the landing page's
 * game-select list, which can omit a built game (King's Gate) that should
 * still be reachable by URL.
 */
export const GAME_SLUGS = ['hyperbloom', 'mint-condition', 'love-triangles', 'detour', 'tashkalar', 'kingsgate'] as const;

export type Slug = (typeof GAME_SLUGS)[number];

export type Route =
  | { kind: 'home' }
  | { kind: 'game-home'; slug: Slug }
  | { kind: 'room'; slug: Slug; roomCode: string }
  | { kind: 'game-notes'; slug: Slug }
  | { kind: 'auth-verify'; token: string }
  | { kind: 'settings' };

// Slugs only ever contain [a-z-], so no regex escaping is needed.
const SLUG_PATTERN = `(${GAME_SLUGS.join('|')})`;
const ROOM_PATTERN = new RegExp(`^/${SLUG_PATTERN}/room/([A-Za-z0-9]{4})$`);
const NOTES_PATTERN = new RegExp(`^/${SLUG_PATTERN}/notes$`);
const GAME_HOME_PATTERN = new RegExp(`^/${SLUG_PATTERN}/?$`);

/** Pure (takes the path and query string rather than reading window.location) so it can be unit tested. */
export function parseRoute(pathname: string, search: string): Route {
  const roomMatch = pathname.match(ROOM_PATTERN);
  if (roomMatch) return { kind: 'room', slug: roomMatch[1] as Slug, roomCode: roomMatch[2].toUpperCase() };
  const notesMatch = pathname.match(NOTES_PATTERN);
  if (notesMatch) return { kind: 'game-notes', slug: notesMatch[1] as Slug };
  const gameMatch = pathname.match(GAME_HOME_PATTERN);
  if (gameMatch) return { kind: 'game-home', slug: gameMatch[1] as Slug };
  if (pathname === '/auth/verify') {
    const token = new URLSearchParams(search).get('token');
    if (token) return { kind: 'auth-verify', token };
  }
  if (pathname === '/settings') return { kind: 'settings' };
  return { kind: 'home' };
}
