import { LINKS } from '@denimcat/engine-love-triangles';

/**
 * Game-specific payload validators for Love Triangles' action events — the
 * generic room-lifecycle shape checks live in @denimcat/platform instead,
 * since they don't vary per game.
 */
export function isLinkId(value: unknown): value is string {
  return typeof value === 'string' && value in LINKS;
}
