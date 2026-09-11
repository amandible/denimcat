import type { GameState, LinkId } from './types';
import { CROSSES } from './geometry';
import { cloneState } from './state';

/** Promotes bottom-row cards into empty top-row slots, then draws new bottom-row cards where the deck allows. */
export function refillDisplay(state: GameState): GameState {
  const next = cloneState(state);
  for (let i = 0; i < next.topRow.length; i++) {
    if (next.topRow[i] === null && next.bottomRow[i] !== null) {
      next.topRow[i] = next.bottomRow[i];
      next.bottomRow[i] = null;
    }
  }
  for (let i = 0; i < next.bottomRow.length; i++) {
    if (next.bottomRow[i] === null && next.deck.length > 0) {
      next.bottomRow[i] = next.deck.pop()!;
    }
  }
  return next;
}

function allOwnedLinks(state: GameState): Set<LinkId> {
  return new Set(state.seats.flatMap((seat) => state.players[seat].ownedLinks));
}

/**
 * Repeatedly scans the display (top row left-to-right, then bottom row
 * left-to-right) for a card that now crosses an already-drawn line. The
 * first one found is removed, its crossed owners are each paid one gem
 * (deduped per player, even if they own multiple crossed lines), and the
 * display refills — then the scan restarts from the top. This continues
 * until one full pass finds nothing left to remove. Confirmed with the
 * designer as the exact resolution order (it doesn't affect fairness since
 * replacement draws are random either way).
 */
export function sweepUnplayable(state: GameState): GameState {
  let next = state;

  while (true) {
    const owned = allOwnedLinks(next);
    const found = findFirstUnplayable(next, owned);
    if (!found) return next;

    next = cloneState(next);
    const crossedLinks = new Set(CROSSES[found.id]);
    for (const seat of next.seats) {
      const ownsACrossedLine = next.players[seat].ownedLinks.some((id) => crossedLinks.has(id));
      if (ownsACrossedLine) next.players[seat].gems += 1;
    }
    if (found.row === 'top') next.topRow[found.index] = null;
    else next.bottomRow[found.index] = null;

    next = refillDisplay(next);
  }
}

function findFirstUnplayable(
  state: GameState,
  owned: Set<LinkId>,
): { row: 'top' | 'bottom'; index: number; id: LinkId } | null {
  for (let i = 0; i < state.topRow.length; i++) {
    const id = state.topRow[i];
    if (id && CROSSES[id].some((c) => owned.has(c))) return { row: 'top', index: i, id };
  }
  for (let i = 0; i < state.bottomRow.length; i++) {
    const id = state.bottomRow[i];
    if (id && CROSSES[id].some((c) => owned.has(c))) return { row: 'bottom', index: i, id };
  }
  return null;
}
