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
  createdAt: number;
  /** True when no other seat has ever been joined by a different account — safe to offer "cancel" for. */
  cancelable: boolean;
  /** Display names of every other player who has ever joined, in seat order — empty if nobody else has joined yet or nobody gave a name. */
  otherPlayerNames: string[];
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

/** Deletes an abandoned room outright — only meaningful when `MyGame.cancelable` is true; the server re-verifies that itself regardless. */
export async function cancelMyGame(game: Pick<MyGame, 'gameId' | 'code'>): Promise<boolean> {
  const token = loadSessionToken();
  if (!token) return false;
  try {
    const res = await fetch(`${SERVER_URL}/my-games/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ gameId: game.gameId, code: game.code }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

/** A short "how long ago" label for a room's createdAt, to help tell a just-started game apart from one abandoned for weeks. */
export function formatRelativeAge(createdAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
