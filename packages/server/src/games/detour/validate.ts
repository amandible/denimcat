/**
 * Game-specific payload validators for Detour's action events — the
 * generic room-lifecycle shape checks live in @denimcat/platform instead,
 * since they don't vary per game.
 */

export function isCardValue(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 20;
}

/** Matches the engine's own CellId format ("row-col", row 0-3, col 0-4) — see @denimcat/engine-detour's board.ts. */
export function isCellId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-3]-[0-4]$/.test(value);
}
