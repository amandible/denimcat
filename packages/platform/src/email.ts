/**
 * Turn-notification emails (async play): sent when a seat's turn begins
 * while that seat has no live socket connected — see RoomStore.applyAction,
 * which diffs GameModule.getActiveSeat before/after each mutation and calls
 * this. Kept as a small interface + fetch-based Resend implementation
 * rather than pulling in the `resend` package, matching this codebase's
 * general preference for minimal dependencies (Resend's send endpoint is
 * one plain POST).
 */
export interface EmailSender {
  send(to: string, subject: string, text: string): Promise<void>;
}

/** Used whenever RESEND_API_KEY isn't set (local dev, tests, CI) — logs instead of sending, so nothing crashes or silently no-ops without a trace. */
export function createNoopEmailSender(): EmailSender {
  return {
    async send(to, subject) {
      console.log(`[email:noop] would send "${subject}" to ${to} (set RESEND_API_KEY to actually send)`);
    },
  };
}

/** Real Resend integration. Fails soft — a broken/rate-limited email API should never crash the socket server or block the player whose move triggered it (see RoomStore.applyAction's fire-and-forget call). */
export function createResendEmailSender(apiKey: string, from: string): EmailSender {
  return {
    async send(to, subject, text) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from, to, subject, text }),
        });
        if (!res.ok) {
          console.error(`[email:resend] send failed (${res.status}):`, await res.text().catch(() => '<no body>'));
        }
      } catch (error) {
        console.error('[email:resend] send threw:', error);
      }
    },
  };
}

/** Picks Resend when both RESEND_API_KEY and RESEND_FROM are configured, else the noop sender. */
export function createDefaultEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  return apiKey && from ? createResendEmailSender(apiKey, from) : createNoopEmailSender();
}
