export interface StoredSeat {
  role: string;
  seatToken: string;
}

function storageKey(gameSlug: string, roomCode: string): string {
  return `denimcat:${gameSlug}:seat:${roomCode}`;
}

export function loadSeat(gameSlug: string, roomCode: string): StoredSeat | null {
  try {
    const raw = localStorage.getItem(storageKey(gameSlug, roomCode));
    return raw ? (JSON.parse(raw) as StoredSeat) : null;
  } catch {
    return null;
  }
}

export function saveSeat(gameSlug: string, roomCode: string, seat: StoredSeat): void {
  try {
    localStorage.setItem(storageKey(gameSlug, roomCode), JSON.stringify(seat));
  } catch {
    // localStorage unavailable (private browsing, etc.) — reconnect-by-token just won't work.
  }
}

export function clearSeat(gameSlug: string, roomCode: string): void {
  try {
    localStorage.removeItem(storageKey(gameSlug, roomCode));
  } catch {
    // ignore
  }
}
