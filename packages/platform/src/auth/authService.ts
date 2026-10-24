import { nanoid } from 'nanoid';
import type { AuthRepository } from './authRepository';
import type { EmailSender } from '../email';

const MAGIC_LINK_TTL_MS = 20 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Lightweight self-serve-abuse guard — open signup means anyone can request a link, so unlike the rest of this codebase's "closed circle, low risk" email paths, this one gets a cheap cap. No per-IP limiting or CAPTCHA for v1. */
const MAX_LINKS_PER_HOUR = 5;

/** Just enough to catch a typo or empty string — not full RFC validation, which would reject plenty of real addresses this project will never see. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthService {
  /** Always resolves, regardless of whether a link was actually sent (malformed address, rate-limited) — nothing for a caller to branch on, so there's nothing to leak. */
  requestLink(email: string): Promise<void>;
  verifyToken(
    token: string,
  ): Promise<{ sessionToken: string; expiresAt: number; email: string; displayName: string | null; turnChimeEnabled: boolean } | null>;
  checkSession(token: string): Promise<{ email: string; displayName: string | null; turnChimeEnabled: boolean } | null>;
  signOut(token: string): Promise<void>;
  /**
   * Saves every Settings-page preference in one request — deliberately
   * unified rather than one method per field, since everything on that
   * page is account-level and submitted together via its single Save
   * button. Null session means the bearer token is missing/expired —
   * distinct from a successful save, which always echoes back what was
   * actually saved (e.g. the trimmed display name).
   */
  updateProfile(
    sessionToken: string,
    updates: { displayName: string; turnChimeEnabled: boolean },
  ): Promise<{ displayName: string; turnChimeEnabled: boolean } | null>;
}

/**
 * Wraps AuthRepository with policy — TTLs, the magic-link/owner-notification
 * emails, the rate-limit check — mirroring how RoomStore wraps
 * RoomRepository. `ownerEmail` is where "a new account was just created"
 * notifications go; omit to skip that notification entirely (fail-soft,
 * same convention as every other email path in this codebase).
 */
export function createAuthService(
  repo: AuthRepository,
  emailSender: EmailSender,
  appBaseUrl: string | undefined,
  ownerEmail: string | undefined,
): AuthService {
  return {
    async requestLink(email: string): Promise<void> {
      const normalized = email.trim().toLowerCase();
      if (!LOOKS_LIKE_EMAIL.test(normalized)) return;

      const recentCount = await repo.countRecentMagicLinks(normalized, 60 * 60 * 1000);
      if (recentCount >= MAX_LINKS_PER_HOUR) return;

      const { isNew } = await repo.getOrCreateAccount(normalized);
      if (isNew && ownerEmail) {
        emailSender
          .send(ownerEmail, 'New denimcat account', `A new account was just created: ${normalized}`)
          .catch((error) => console.error('[auth] owner notification failed:', error));
      }

      const token = nanoid(32);
      const expiresAt = Date.now() + MAGIC_LINK_TTL_MS;
      await repo.createMagicLink(normalized, token, expiresAt);

      const link = appBaseUrl ? `${appBaseUrl}/auth/verify?token=${encodeURIComponent(token)}` : null;
      const text = link
        ? `Click to sign in to denimcat (expires in 20 minutes):\n\n${link}`
        : 'Your denimcat sign-in link is ready, but no APP_BASE_URL is configured to build a clickable one.';
      emailSender.send(normalized, 'Your denimcat sign-in link', text).catch((error) => console.error('[auth] sign-in link email failed:', error));
    },

    async verifyToken(token: string) {
      const consumed = await repo.consumeMagicLink(token);
      if (!consumed) return null;
      const sessionToken = nanoid(32);
      const expiresAt = Date.now() + SESSION_TTL_MS;
      await repo.createSession(consumed.email, sessionToken, expiresAt);
      const displayName = await repo.getDisplayName(consumed.email);
      const turnChimeEnabled = await repo.getTurnChimeEnabled(consumed.email);
      return { sessionToken, expiresAt, email: consumed.email, displayName, turnChimeEnabled };
    },

    async checkSession(token: string) {
      const session = await repo.getSession(token);
      if (!session) return null;
      const displayName = await repo.getDisplayName(session.email);
      const turnChimeEnabled = await repo.getTurnChimeEnabled(session.email);
      return { email: session.email, displayName, turnChimeEnabled };
    },

    async signOut(token: string): Promise<void> {
      await repo.deleteSession(token);
    },

    async updateProfile(sessionToken: string, updates: { displayName: string; turnChimeEnabled: boolean }) {
      const session = await repo.getSession(sessionToken);
      if (!session) return null;
      const trimmed = updates.displayName.trim().slice(0, 40);
      await repo.setDisplayName(session.email, trimmed);
      await repo.setTurnChimeEnabled(session.email, updates.turnChimeEnabled);
      return { displayName: trimmed, turnChimeEnabled: updates.turnChimeEnabled };
    },
  };
}
