const PREF_KEY = 'denimcat:prefs:turnChime';

/** Whether the turn chime should play — defaults to true (on) when the preference has never been set, so this ships with no behavior change. Per-browser, not synced to the account: the chime only ever matters while this browser has a tab open on a game. */
export function isTurnChimeEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setTurnChimeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, enabled ? '1' : '0');
  } catch {
    // localStorage unavailable (private browsing, etc.) — the toggle just won't persist across reloads.
  }
}

/**
 * A short, synthesized two-note chime via the Web Audio API — no audio
 * asset to source/license/ship. One shared AudioContext, created lazily on
 * first use (browsers refuse to start one before any user gesture has
 * happened on the page at all; by the time a turn chime could ever fire,
 * the player has already interacted with the page to get this far).
 */
let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
}

function playTone(ctx: AudioContext, startTime: number, frequency: number, duration: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  // Quick linear attack then exponential decay — avoids the click a hard
  // on/off edge would make, and reads as "gentle" rather than a harsh beep.
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

/** A soft rising two-note chime (A5 -> E6) — plays once, fire-and-forget. No-ops in an environment without Web Audio (e.g. a test runner), or when the player has turned it off in Settings. */
export function playTurnChime(): void {
  if (!isTurnChimeEnabled()) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  playTone(ctx, now, 880, 0.18);
  playTone(ctx, now + 0.12, 1318.5, 0.22);
}
