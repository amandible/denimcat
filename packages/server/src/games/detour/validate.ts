import { BOARD_CELLS } from '@denimcat/engine-detour';

/**
 * Game-specific payload validators for Detour's action events — the
 * generic room-lifecycle shape checks live in @denimcat/platform instead,
 * since they don't vary per game.
 */

export function isCardValue(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 16;
}

/**
 * Checks membership in the engine's own BOARD_CELLS rather than matching a
 * locally-reimplemented shape regex — a "row-col" string that LOOKS
 * well-formed (e.g. "0-4" or "4-0") can still name a row/column index past
 * this board's 4x4 edges, which isLegalPlacement defends against
 * independently, but rejecting it here too means a malformed target never
 * reaches the engine as a confusing INTERNAL_ERROR in the first place.
 */
export function isCellId(value: unknown): value is string {
  return typeof value === 'string' && (BOARD_CELLS as readonly string[]).includes(value);
}
