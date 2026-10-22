import type { EngineResult, GameState, PrizeCard, SeatId } from './types';
import { cloneState, pushLog, startAuction } from './state';
import { ok, err } from './result';
import { drawCardForSeat, drawPostAuctionCards } from './decks';
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

/**
 * Shared tail for every way a prize-choice round can resolve (taking a
 * prize, or choosing a consolation reward): shift the display, then move
 * on. `afterShift` is an optional extra mutation applied right after that
 * shift but before the game-end check and the reveal/conclude branch — the
 * "add two prizes to the lowest slot" reward needs this exact slot (so the
 * new prizes land in the slot the shift just emptied, rather than being
 * immediately swept up by it) and needs to be accounted for before
 * deciding whether the game just ended.
 */
function afterPrizeChoice(state: GameState, afterShift?: (s: GameState) => GameState): GameState {
  let next = shiftDisplay(state);
  if (afterShift) next = afterShift(next);
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
 * The slot a bid of `bidAmount` points to: the priciest slot priced at or
 * below it, found purely by price position — NOT the priciest OCCUPIED
 * such slot. Confirmed with the designer: a bid can "point to" an empty
 * slot (or to nothing at all, if it doesn't even reach the cheapest slot's
 * price) even while a cheaper slot sits occupied — that's exactly the
 * trigger for the consolation-reward choice (see chooseAuctionReward), not
 * a fallback to the cheaper slot. Returns null only when the bid is below
 * the cheapest slot's price; a non-null result can still point at an empty
 * slot, which callers must check for separately (see eligibleTakeSlotIndex
 * below, which folds that check in for the common case).
 */
export function slotIndexForBid(priceSlots: GameState['priceSlots'], bidAmount: number): number | null {
  for (let i = priceSlots.length - 1; i >= 0; i--) {
    if (priceSlots[i].price <= bidAmount) return i;
  }
  return null;
}

/**
 * The one slot a prize can actually be taken from under the given bid:
 * slotIndexForBid's result, but only when that slot currently holds a
 * prize. Null covers both ways rules.md describes ending up with nothing
 * to take — "a bid that points to an empty slot" and "a bid lower than the
 * lowest slot" — since neither needs to be distinguished for gameplay
 * purposes (chooseAuctionReward treats them identically). There's no
 * choice of SLOT when this is non-null — only, if that slot holds more
 * than one prize, a choice of which one. Exported so the client can
 * highlight the same slot and gate which prizes are clickable, without
 * duplicating this logic.
 */
export function eligibleTakeSlotIndex(priceSlots: GameState['priceSlots'], bidAmount: number): number | null {
  const slotIndex = slotIndexForBid(priceSlots, bidAmount);
  return slotIndex !== null && priceSlots[slotIndex].prizes.length > 0 ? slotIndex : null;
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
    return err('NO_AFFORDABLE_PRIZE', 'Nothing to take this round — choose a reward instead.');
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

export type AuctionReward = 'draw_cards' | 'extra_shift' | 'add_prizes';

/**
 * The consolation choice when a winning bid comes up with nothing to take
 * — either it doesn't reach the cheapest slot's price, or the one slot it
 * points to (see slotIndexForBid) is currently empty, even if a cheaper
 * slot is occupied. Replaces the old plain "pay your bid, take nothing"
 * skip entirely — confirmed with the designer. They still pay their bid
 * (already discarded when the auction resolved) and choose exactly one of:
 * - 'draw_cards': draw two money cards.
 * - 'extra_shift': shift the display one extra space (on top of the
 *   normal end-of-round shift every auction gets regardless) — reuses
 *   shiftDisplay verbatim, discard-and-replace and upper-slot-unlock side
 *   effects included.
 * - 'add_prizes': two prizes drawn blind from the prize deck (no reveal,
 *   no choice) land in the lowest slot, right after the normal
 *   end-of-round shift empties it — see afterPrizeChoice's `afterShift`.
 * Each fails soft (fewer or zero cards/prizes) if its own deck runs dry,
 * same convention as every other deck-exhaustion point in this engine.
 */
export function chooseAuctionReward(state: GameState, seat: SeatId, reward: AuctionReward): EngineResult {
  if (state.phase !== 'awaiting-prize-choice') {
    return err('NOT_AWAITING_PRIZE_CHOICE', 'No prize is currently waiting to be chosen.');
  }
  if (state.auction.winnerSeat !== seat) {
    return err('NOT_THE_WINNER', 'Only the auction winner may choose a reward.');
  }

  const bidAmount = (state.auction.highestBid as NonNullable<GameState['auction']['highestBid']>).amount;
  if (eligibleTakeSlotIndex(state.priceSlots, bidAmount) !== null) {
    return err('AFFORDABLE_PRIZE_AVAILABLE', 'At least one displayed prize is affordable and must be taken instead.');
  }

  if (reward === 'draw_cards') {
    let next = drawCardForSeat(state, seat);
    next = drawCardForSeat(next, seat);
    pushLog(next, `${seat} took no prize this round — drew two extra cards instead.`);
    return ok(afterPrizeChoice(next));
  }

  if (reward === 'extra_shift') {
    const next = shiftDisplay(state);
    pushLog(next, `${seat} took no prize this round — shifted the display an extra space instead.`);
    return ok(afterPrizeChoice(next));
  }

  const next = cloneState(state);
  pushLog(next, `${seat} took no prize this round — added two prizes to the lowest slot instead.`);
  return ok(
    afterPrizeChoice(next, (s) => {
      const drawn: PrizeCard[] = [];
      for (let i = 0; i < 2 && s.prizeDeck.length > 0; i++) drawn.push(s.prizeDeck.pop()!);
      if (drawn.length > 0) s.priceSlots[0].prizes = [...s.priceSlots[0].prizes, ...drawn];
      return s;
    }),
  );
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
