import type { EngineResult, GameState, PrizeCard, SeatId } from './types';
import { cloneState, pushLog, startAuction } from './state';
import { ok, err } from './result';
import { drawPostAuctionCards } from './decks';
import { applyGameEndIfDone } from './scoring';

/**
 * Every unbought prize drifts one slot toward the priciest end (index 5) —
 * unsold prizes get more expensive over time. A prize already at index 5
 * that goes unbought again is permanently discarded — but, per the
 * designer's latest revision, replaced by a freshly drawn prize entering at
 * the now-empty bottom slot (index 0), one new prize per discarded one, so
 * the display doesn't just shrink over a long game. Fails soft (fewer, or
 * zero, replacements) once the prize deck itself runs dry — same
 * fail-soft spirit as every other deck-exhaustion point in this engine,
 * not a special case.
 *
 * Also unlocks the top two slots for manual placement (see
 * `GameState.unlockedUpperSlots`) the first time a prize naturally drifts
 * into each of them — confirmed with the designer as a permanent unlock,
 * so once set it's never removed even if the slot empties out again.
 */
export function shiftDisplay(state: GameState): GameState {
  const next = cloneState(state);
  const lastIndex = next.priceSlots.length - 1;
  const original = next.priceSlots.map((slot) => slot.prizes);
  const upperIndices = [lastIndex - 1, lastIndex];

  const agedOut = next.priceSlots[lastIndex].prizes;
  if (agedOut.length > 0) {
    next.discardPile = [...next.discardPile, ...agedOut];
  }
  next.priceSlots[lastIndex].prizes = []; // permanently removed from the game
  for (let i = lastIndex - 1; i >= 0; i--) {
    next.priceSlots[i + 1].prizes = original[i];
    next.priceSlots[i].prizes = [];
  }

  const replacements: PrizeCard[] = [];
  for (let i = 0; i < agedOut.length && next.prizeDeck.length > 0; i++) {
    replacements.push(next.prizeDeck.pop()!);
  }
  if (replacements.length > 0) {
    next.priceSlots[0].prizes = [...next.priceSlots[0].prizes, ...replacements];
  }

  const newlyUnlocked = upperIndices.filter(
    (i) => next.priceSlots[i].prizes.length > 0 && !next.unlockedUpperSlots.includes(i),
  );
  if (newlyUnlocked.length > 0) {
    next.unlockedUpperSlots = [...next.unlockedUpperSlots, ...newlyUnlocked];
  }

  return next;
}

/** Draws for the winner + first passer, then either ends the game or opens the next auction. */
function concludeAuction(state: GameState): GameState {
  const winnerSeat = state.auction.winnerSeat as SeatId;
  const firstPasserSeat = state.auction.passedSeats[0] ?? null;

  let next = drawPostAuctionCards(state, winnerSeat, firstPasserSeat);
  next = applyGameEndIfDone(next);
  if (next.phase === 'ended') return next;

  next = cloneState(next);
  next.auction = startAuction(next.seats, winnerSeat);
  next.phase = 'auction-active';
  return next;
}

/** Shared tail for both taking and skipping a prize: shift the display, then move on. */
function afterPrizeChoice(state: GameState): GameState {
  let next = shiftDisplay(state);
  next = applyGameEndIfDone(next);
  if (next.phase === 'ended') return next;

  if (next.prizeDeck.length > 0) {
    next = cloneState(next);
    // Reveal now (visible to everyone), before the winner has chosen a slot
    // for it — matches "the winner gets to see the next prize and decide
    // which slot to place it in."
    next.revealedPrize = next.prizeDeck.pop()!;
    next.phase = 'awaiting-new-prize-placement';
    return next;
  }
  return concludeAuction(next);
}

/**
 * The one slot a prize must be taken from under the given bid: the
 * priciest occupied slot priced at or below `bidAmount` (rules.md: "takes
 * their choice of prizes from the highest slot whose price is less than or
 * equal to their bid"). There's no choice of SLOT — only, if that slot
 * holds more than one prize, a choice of which one. Null means nothing
 * displayed is affordable (skipPrizeChoice territory). Exported so the
 * client can highlight the same slot and gate which prizes are clickable,
 * without duplicating this scan.
 */
export function eligibleTakeSlotIndex(priceSlots: GameState['priceSlots'], bidAmount: number): number | null {
  for (let i = priceSlots.length - 1; i >= 0; i--) {
    if (priceSlots[i].price <= bidAmount && priceSlots[i].prizes.length > 0) return i;
  }
  return null;
}

export function takePrize(state: GameState, seat: SeatId, prizeId: string): EngineResult {
  if (state.phase !== 'awaiting-prize-choice') {
    return err('NOT_AWAITING_PRIZE_CHOICE', 'No prize is currently waiting to be chosen.');
  }
  if (state.auction.winnerSeat !== seat) {
    return err('NOT_THE_WINNER', 'Only the auction winner may take a prize.');
  }

  const bidAmount = (state.auction.highestBid as NonNullable<GameState['auction']['highestBid']>).amount;
  const slotIndex = eligibleTakeSlotIndex(state.priceSlots, bidAmount);
  if (slotIndex === null) {
    return err('NO_AFFORDABLE_PRIZE', 'Nothing displayed is affordable — skip instead.');
  }
  if (!state.priceSlots[slotIndex].prizes.some((p) => p.id === prizeId)) {
    return err(
      'WRONG_SLOT',
      "That prize isn't in the slot you must take from this round — the priciest slot within your bid that still holds a prize.",
    );
  }

  const next = cloneState(state);
  const slot = next.priceSlots[slotIndex];
  const prize = slot.prizes.find((p) => p.id === prizeId)!;
  slot.prizes = slot.prizes.filter((p) => p.id !== prizeId);
  next.players[seat].wonPrizes = [...next.players[seat].wonPrizes, prize];
  pushLog(next, `${seat} took the ${prize.color} ${prize.points}-point prize.`);

  return ok(afterPrizeChoice(next));
}

/**
 * The winner may forfeit taking a prize only when genuinely nothing in the
 * display is priced at or below their winning bid — confirmed directly with
 * the designer: they still pay their bid (already discarded when the
 * auction resolved), take nothing, and the game proceeds exactly as if a
 * prize had been taken (display still shifts, then the normal reveal/draw/
 * next-auction flow continues).
 */
export function skipPrizeChoice(state: GameState, seat: SeatId): EngineResult {
  if (state.phase !== 'awaiting-prize-choice') {
    return err('NOT_AWAITING_PRIZE_CHOICE', 'No prize is currently waiting to be chosen.');
  }
  if (state.auction.winnerSeat !== seat) {
    return err('NOT_THE_WINNER', 'Only the auction winner may skip taking a prize.');
  }

  const bidAmount = (state.auction.highestBid as NonNullable<GameState['auction']['highestBid']>).amount;
  if (eligibleTakeSlotIndex(state.priceSlots, bidAmount) !== null) {
    return err('AFFORDABLE_PRIZE_AVAILABLE', 'At least one displayed prize is affordable and must be taken instead.');
  }

  const next = cloneState(state);
  pushLog(next, `${seat} took no prize this round.`);
  return ok(afterPrizeChoice(next));
}

/**
 * The winner may place the newly-revealed prize into any unlocked slot,
 * including one that already holds a prize — stacking it there (confirmed
 * with the designer: this is deliberate, not an oversight, and is exactly
 * what lets a slot end up with more than one prize for takePrize's
 * choice-within-a-slot to matter). Only the upper-slot natural-unlock gate
 * still restricts which slots are legal targets.
 */
export function placeNewPrize(state: GameState, seat: SeatId, slotIndex: number): EngineResult {
  if (state.phase !== 'awaiting-new-prize-placement') {
    return err('NOT_AWAITING_PLACEMENT', 'No newly revealed prize is waiting to be placed.');
  }
  if (state.auction.winnerSeat !== seat) {
    return err('NOT_THE_WINNER', 'Only the auction winner may place the new prize.');
  }
  if (slotIndex < 0 || slotIndex >= state.priceSlots.length) {
    return err('OUT_OF_BOUNDS', 'No such price slot.');
  }
  const lastIndex = state.priceSlots.length - 1;
  const isUpperSlot = slotIndex === lastIndex || slotIndex === lastIndex - 1;
  if (isUpperSlot && !state.unlockedUpperSlots.includes(slotIndex)) {
    return err('SLOT_LOCKED', 'That slot is not available for placement until a prize has naturally risen into it.');
  }
  if (!state.revealedPrize) {
    return err('NO_PRIZE_TO_PLACE', 'There is no revealed prize waiting to be placed.');
  }

  const next = cloneState(state);
  const revealed = next.revealedPrize as NonNullable<GameState['revealedPrize']>;
  next.revealedPrize = null;
  next.priceSlots[slotIndex].prizes = [...next.priceSlots[slotIndex].prizes, revealed];
  pushLog(next, `${seat} placed the new ${revealed.color} ${revealed.points}-point prize into the ${next.priceSlots[slotIndex].price}-price slot.`);

  return ok(concludeAuction(next));
}
