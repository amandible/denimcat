import type { EngineResult, GameState, PrizeCard, SeatId } from './types';
import { cloneState, pushLog } from './state';
import { ok, err } from './result';
import { determineWinnersV3, finalizeGameEnd } from './scoring';

function richestHandSeats(state: GameState): SeatId[] {
  const totals = state.seats.map((seat) => state.players[seat].hand.reduce((a, b) => a + b, 0));
  const max = Math.max(...totals);
  return state.seats.filter((_, i) => totals[i] === max);
}

function allDisplayedPrizes(state: GameState): PrizeCard[] {
  return state.priceSlots.flatMap((slot) => slot.prizes);
}

/** Removes `prizeId` from whichever price slot currently holds it, mutating `state` in place (caller must already be working on its own clone). */
function removePrizeFromDisplay(state: GameState, prizeId: string): PrizeCard {
  for (const slot of state.priceSlots) {
    const idx = slot.prizes.findIndex((p) => p.id === prizeId);
    if (idx !== -1) {
      const [removed] = slot.prizes.splice(idx, 1);
      return removed;
    }
  }
  throw new Error(`Prize ${prizeId} not found in the display.`);
}

function grantEndgamePrize(state: GameState, seat: SeatId, prizeId: string): GameState {
  const next = cloneState(state);
  const prizeCard = removePrizeFromDisplay(next, prizeId);
  next.players[seat].wonPrizes = [...next.players[seat].wonPrizes, prizeCard];
  pushLog(next, `${seat} had the most money left and took the ${prizeCard.color} ${prizeCard.points}-point prize.`);
  return next;
}

/**
 * v3's endgame: triggers the instant the prize deck's last card is added to
 * the display (i.e. the moment the deck empties, since every pop
 * immediately places its card into a slot — see prizes.ts's shiftDisplay
 * and placeNewPrizeV2) rather than waiting for every slot to also empty out
 * (v1/v2's isGameOver). The seat with the most money left in hand takes the
 * cheapest prize still in the display; a tie for richest means nobody gets
 * the bonus; a tie for cheapest is the richest seat's own choice (see
 * chooseEndgamePrize) — confirmed with the designer as a real player
 * decision, not an automatic pick, since a future color/value could make an
 * "obviously correct" pick stop being obvious.
 */
export function applyGameEndIfDoneV3(state: GameState): GameState {
  if (state.prizeDeck.length > 0) return state;

  const richest = richestHandSeats(state);
  const displayed = allDisplayedPrizes(state);

  if (richest.length === 1 && displayed.length > 0) {
    const minPoints = Math.min(...displayed.map((p) => p.points));
    const tied = displayed.filter((p) => p.points === minPoints);
    if (tied.length === 1) {
      const withBonus = grantEndgamePrize(state, richest[0], tied[0].id);
      return finalizeGameEnd(withBonus, determineWinnersV3(withBonus));
    }
    const next = cloneState(state);
    next.phase = 'awaiting-endgame-prize-choice';
    next.endgameChoice = { seat: richest[0], prizeIds: tied.map((p) => p.id) };
    pushLog(next, `${richest[0]} has the most money left and must choose which prize to take.`);
    return next;
  }

  return finalizeGameEnd(state, determineWinnersV3(state));
}

/** Resolves the v3 endgame tie-break once the chosen seat picks which tied prize to take. */
export function chooseEndgamePrize(state: GameState, seat: SeatId, prizeId: string): EngineResult {
  if (state.phase !== 'awaiting-endgame-prize-choice' || !state.endgameChoice) {
    return err('NOT_AWAITING_ENDGAME_CHOICE', 'No endgame prize choice is currently pending.');
  }
  if (state.endgameChoice.seat !== seat) {
    return err('NOT_THE_CHOOSER', 'Only the seat with the most money left in hand may choose.');
  }
  if (!state.endgameChoice.prizeIds.includes(prizeId)) {
    return err('INVALID_CHOICE', 'That prize is not one of the tied options.');
  }

  const withBonus = grantEndgamePrize(state, seat, prizeId);
  withBonus.endgameChoice = null;
  return ok(finalizeGameEnd(withBonus, determineWinnersV3(withBonus)));
}
