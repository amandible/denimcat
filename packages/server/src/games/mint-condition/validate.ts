/**
 * Game-specific payload validators for Mint Condition's action events — the
 * generic room-lifecycle shape checks live in @denimcat/platform instead,
 * since they don't vary per game.
 */

export function isCardArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => Number.isInteger(v) && v >= 1 && v <= 13);
}

export function isSlotIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < 6;
}

const AUCTION_REWARDS = new Set(['draw_cards', 'extra_shift', 'add_prizes']);

export function isAuctionReward(value: unknown): value is 'draw_cards' | 'extra_shift' | 'add_prizes' {
  return typeof value === 'string' && AUCTION_REWARDS.has(value);
}
