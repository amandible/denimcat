import { loadSessionToken } from './authToken';
import { SERVER_URL } from '../socket';

export interface MyGame {
  gameId: string;
  displayName: string;
  code: string;
  roomUrlPath: string;
  seatCount: number;
  mySeatCount: number;
  isMyTurn: boolean;
  lastActivityAt: number;
}

/** The landing page's "your games" list — every currently-open room the signed-in account holds a seat in, across every game. Resolves to [] if signed out or on any error, same fail-soft convention as the rest of this inline-fetch pattern. */
export async function fetchMyGames(): Promise<MyGame[]> {
  const token = loadSessionToken();
  if (!token) return [];
  try {
    const res = await fetch(`${SERVER_URL}/my-games`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return data.ok ? (data.games as MyGame[]) : [];
  } catch {
    return [];
  }
}

/**
 * The room URL a "jump back in" link should navigate to, including a
 * hotseat room's `?hotseat=1&players=N` query string — hotseat is never
 * persisted server-side (see every game's own HomeView.tsx goToRoom), so
 * it has to be reconstructed here. `mySeatCount === seatCount` (holding
 * every seat, with more than one seat total) is exactly what a hotseat
 * room looks like from the server's point of view, since every seat was
 * joined from the same authenticated browser.
 */
export function myGameUrl(game: MyGame): string {
  const isHotseat = game.seatCount > 1 && game.mySeatCount === game.seatCount;
  return isHotseat ? `${game.roomUrlPath}?hotseat=1&players=${game.seatCount}` : game.roomUrlPath;
}
