/**
 * The one display rule for identifying a player, used everywhere a seat is
 * shown to a viewer: a player-supplied name always leads when one exists,
 * with their position (color, faction, "Player 1", whatever a given game
 * calls it) kept alongside as a parenthetical — never dropped, since we
 * still care what position a player was in, both during the game and
 * later (e.g. in a recap or in playtest feedback). No name on file falls
 * back to the position alone.
 */
export function playerLabel(name: string | null | undefined, position: string): string {
  return name ? `${name} (${position})` : position;
}

/**
 * Replaces every whole-word occurrence of a seat id in `text` with its
 * resolved display label — e.g. an engine log line like "p1 bid 5." (the
 * raw internal seat id, since engines are deliberately display-agnostic)
 * becomes "Alice (Player 1) bid 5.". Whole-word matches only, so a
 * resolved label that happens to contain a seat id as a substring (e.g. a
 * player named "P1") is never re-matched by a later replacement in the
 * same pass — built as one combined regex with a callback rather than
 * chained per-seat .replace() calls, for exactly that reason.
 */
export function substituteSeatTokens(text: string, seatIds: readonly string[], resolve: (seatId: string) => string): string {
  if (seatIds.length === 0) return text;
  const pattern = new RegExp(`\\b(${seatIds.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');
  return text.replace(pattern, (match) => resolve(match));
}
