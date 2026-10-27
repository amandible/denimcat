const KEY = 'denimcat:auth:session';
const EMAIL_KEY = 'denimcat:auth:email';
const DISPLAY_NAME_KEY = 'denimcat:auth:displayName';
const TURN_CHIME_ENABLED_KEY = 'denimcat:auth:turnChimeEnabled';
const IS_OWNER_KEY = 'denimcat:auth:isOwner';

export function loadSessionToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveSessionToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // localStorage unavailable (private browsing, etc.) — the sign-in gate just won't persist across reloads.
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Cached alongside the session token so game lobbies (LobbyView's "email me when it's my turn" checkbox, its name field default) can use the signed-in identity without a round trip. Populated from /auth/session and /auth/verify's responses, which already return both fields. */
export function loadAuthEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function loadDisplayName(): string | null {
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY);
  } catch {
    return null;
  }
}

/** Account-level (not per-browser), saved via Settings alongside the display name — chime.ts's playTurnChime reads this cache directly. Defaults to true, matching the server's default for an account that's never saved Settings. */
export function loadTurnChimeEnabled(): boolean {
  try {
    return localStorage.getItem(TURN_CHIME_ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Account-level (not per-browser) — gates the owner-only "Playtest notes" link. Pure UI convenience: the server independently enforces this on every owner-only route regardless of what this cache says. Defaults to false. */
export function loadIsOwner(): boolean {
  try {
    return localStorage.getItem(IS_OWNER_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveIdentity(email: string, displayName: string | null, turnChimeEnabled: boolean, isOwner: boolean): void {
  try {
    localStorage.setItem(EMAIL_KEY, email);
    if (displayName) localStorage.setItem(DISPLAY_NAME_KEY, displayName);
    else localStorage.removeItem(DISPLAY_NAME_KEY);
    localStorage.setItem(TURN_CHIME_ENABLED_KEY, turnChimeEnabled ? '1' : '0');
    localStorage.setItem(IS_OWNER_KEY, isOwner ? '1' : '0');
  } catch {
    // ignore — same fallback as the session token above
  }
}

function clearIdentity(): void {
  try {
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(DISPLAY_NAME_KEY);
    localStorage.removeItem(TURN_CHIME_ENABLED_KEY);
    localStorage.removeItem(IS_OWNER_KEY);
  } catch {
    // ignore
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Called by useRoomConnection when a game socket rejects for an invalid or
 * expired session (`connect_error`), so App can drop back to the sign-in
 * gate — a tiny pub/sub instead of Context/Redux, since this is one global
 * signal with no payload. Returns an unsubscribe function.
 */
export function onSessionInvalidated(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateSession(): void {
  clearSessionToken();
  clearIdentity();
  for (const listener of listeners) listener();
}
