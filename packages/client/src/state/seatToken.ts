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

/**
 * Role-scoped variants, additive alongside the functions above — needed
 * when one tab holds more than one seat at once (hotseat mode), since the
 * plain `storageKey` above would collide across seats for the same room.
 * Normal single-seat play never touches these.
 */
function storageKeyForRole(gameSlug: string, roomCode: string, role: string): string {
  return `denimcat:${gameSlug}:seat:${roomCode}:${role}`;
}

export function loadSeatForRole(gameSlug: string, roomCode: string, role: string): StoredSeat | null {
  try {
    const raw = localStorage.getItem(storageKeyForRole(gameSlug, roomCode, role));
    return raw ? (JSON.parse(raw) as StoredSeat) : null;
  } catch {
    return null;
  }
}

export function saveSeatForRole(gameSlug: string, roomCode: string, role: string, seat: StoredSeat): void {
  try {
    localStorage.setItem(storageKeyForRole(gameSlug, roomCode, role), JSON.stringify(seat));
  } catch {
    // localStorage unavailable (private browsing, etc.) — reconnect-by-token just won't work.
  }
}

export function clearSeatForRole(gameSlug: string, roomCode: string, role: string): void {
  try {
    localStorage.removeItem(storageKeyForRole(gameSlug, roomCode, role));
  } catch {
    // ignore
  }
}
