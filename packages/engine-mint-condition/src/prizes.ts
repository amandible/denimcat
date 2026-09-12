import type { EngineResult, GameState, SeatId } from './types';
import { cloneState, startAuction } from './state';
import { ok, err } from './result';
import { drawPostAuctionCards } from './decks';
import { applyGameEndIfDone } from './scoring';

/**
 * Every unbought prize drifts one slot toward the priciest end (index 5) —
 * unsold prizes get more expensive over time. A prize already at index 5
 * that goes unbought again is permanently removed from the game rather
 * than staying capped there.
 */
export function shiftDisplay(state: GameState): GameState {
  const next = cloneState(state);
  const lastIndex = next.priceSlots.length - 1;
  const original = next.priceSlots.map((slot) => slot.prizes);

  next.priceSlots[lastIndex].prizes = []; // discarded outright
  for (let i = lastIndex - 1; i >= 0; i--) {
    next.priceSlots[i + 1].prizes = original[i];
    next.priceSlots[i].prizes = [];
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
    // which empty slot to place it in."
    next.revealedPrize = next.prizeDeck.pop()!;
    next.phase = 'awaiting-new-prize-placement';
    return next;
  }
  return concludeAuction(next);
}

export function takePrize(state: GameState, seat: SeatId, prizeId: string): EngineResult {
  if (state.phase !== 'awaiting-prize-choice') {
    return err('NOT_AWAITING_PRIZE_CHOICE', 'No prize is currently waiting to be chosen.');
  }
  if (state.auction.winnerSeat !== seat) {
    return err('NOT_THE_WINNER', 'Only the auction winner may take a prize.');
  }

  const bidAmount = (state.auction.highestBid as NonNullable<GameState['auction']['highestBid']>).amount;
  let slotIndex = -1;
  for (let i = 0; i < state.priceSlots.length; i++) {
    if (state.priceSlots[i].prizes.some((p) => p.id === prizeId)) {
      slotIndex = i;
      break;
    }
  }
  if (slotIndex === -1) return err('PRIZE_NOT_FOUND', 'That prize is not currently in the display.');
  if (state.priceSlots[slotIndex].price > bidAmount) {
    return err('PRIZE_TOO_EXPENSIVE', "That prize's price exceeds the winning bid.");
  }

  const next = cloneState(state);
  const slot = next.priceSlots[slotIndex];
  const prize = slot.prizes.find((p) => p.id === prizeId)!;
  slot.prizes = slot.prizes.filter((p) => p.id !== prizeId);
  next.players[seat].wonPrizes = [...next.players[seat].wonPrizes, prize];

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
  const anyAffordable = state.priceSlots.some((slot) => slot.price <= bidAmount && slot.prizes.length > 0);
  if (anyAffordable) {
    return err('AFFORDABLE_PRIZE_AVAILABLE', 'At least one displayed prize is affordable and must be taken instead.');
  }

  return ok(afterPrizeChoice(cloneState(state)));
}

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
  if (state.priceSlots[slotIndex].prizes.length > 0) {
    return err('SLOT_OCCUPIED', 'That slot is not empty.');
  }
  if (!state.revealedPrize) {
    return err('NO_PRIZE_TO_PLACE', 'There is no revealed prize waiting to be placed.');
  }

  const next = cloneState(state);
  const revealed = next.revealedPrize as NonNullable<GameState['revealedPrize']>;
  next.revealedPrize = null;
  next.priceSlots[slotIndex].prizes = [...next.priceSlots[slotIndex].prizes, revealed];

  return ok(concludeAuction(next));
}
