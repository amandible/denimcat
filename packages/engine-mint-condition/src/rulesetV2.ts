import type { AuctionRewardChoiceV2, MintConditionRuleset } from './ruleset';
import type { EngineResult, GameState, SeatId } from './types';
import { cloneState, pushLog } from './state';
import { ok, err } from './result';
import { drawCardForSeat } from './decks';
import { afterPrizeChoice, concludeAuction, eligibleTakeSlotIndex, shiftDisplay, slotIndexForBid, v1Ruleset, type AuctionReward } from './prizes';

/**
 * v2: "the first two people to pass get to draw a card" — replaces v1's
 * winner-plus-first-passer rule. `state.auction.passedSeats` already
 * holds every passer in the order they passed, so this reads directly
 * from the full state rather than needing new parameters threaded in —
 * `winnerSeat`/`firstPasserSeat` are accepted (matching the interface)
 * but unused here, same values concludeAuction already derives from
 * `state.auction` right before calling this.
 */
function drawPostAuctionCardsV2(state: GameState, _winnerSeat: SeatId, _firstPasserSeat: SeatId | null): GameState {
  let next = state;
  for (const seat of state.auction.passedSeats.slice(0, 2)) {
    next = drawCardForSeat(next, seat);
  }
  return next;
}

/**
 * v2's card-draw tier: 2 cards for the bottom two slots (or a bid below
 * the lowest slot's price), 3 for the middle two, 4 for the top two —
 * `slotIndex` is slotIndexForBid's result, which is exactly what
 * determines the tier regardless of whether that slot happened to be
 * occupied.
 */
export function cardsForRewardTier(slotIndex: number | null): number {
  if (slotIndex === null || slotIndex <= 1) return 2;
  if (slotIndex <= 3) return 3;
  return 4;
}

/**
 * v2: the card draw is no longer one of three choices — it always
 * happens, with its size set by cardsForRewardTier. On top of that, the
 * winner may independently choose to shift the display an extra space
 * and/or add an extra prize to the lowest slot, any combination of the
 * two (including neither). Replaces v1's single three-way
 * AuctionReward pick with AuctionRewardChoiceV2's two booleans.
 */
function chooseAuctionRewardV2(
  state: GameState,
  seat: SeatId,
  reward: AuctionReward | AuctionRewardChoiceV2,
  rules: MintConditionRuleset = v2Ruleset,
): EngineResult {
  if (state.phase !== 'awaiting-prize-choice') {
    return err('NOT_AWAITING_PRIZE_CHOICE', 'No prize is currently waiting to be chosen.');
  }
  if (state.auction.winnerSeat !== seat) {
    return err('NOT_THE_WINNER', 'Only the auction winner may choose a reward.');
  }
  if (typeof reward !== 'object' || reward === null) {
    return err('INVALID_REWARD', 'This room expects the v2 reward choice shape.');
  }

  const bidAmount = (state.auction.highestBid as NonNullable<GameState['auction']['highestBid']>).amount;
  if (eligibleTakeSlotIndex(state.priceSlots, bidAmount) !== null) {
    return err('AFFORDABLE_PRIZE_AVAILABLE', 'At least one displayed prize is affordable and must be taken instead.');
  }

  const slotIndex = slotIndexForBid(state.priceSlots, bidAmount);
  const cardCount = cardsForRewardTier(slotIndex);

  let next = state;
  for (let i = 0; i < cardCount; i++) next = drawCardForSeat(next, seat);
  pushLog(next, `${seat} took no prize this round — drew ${cardCount} cards instead.`);

  if (reward.extraShift) {
    next = shiftDisplay(next);
    pushLog(next, `${seat} also shifted the display an extra space.`);
  }

  if (reward.addPrize) {
    next = cloneState(next);
    pushLog(next, `${seat} also added a prize to the lowest slot.`);
    return ok(
      afterPrizeChoice(next, rules, (s) => {
        if (s.prizeDeck.length === 0) return s;
        const drawn = s.prizeDeck.pop()!;
        s.priceSlots[0].prizes = [...s.priceSlots[0].prizes, drawn];
        return s;
      }),
    );
  }

  return ok(afterPrizeChoice(next, rules));
}

/**
 * v2: "no choice of where to place new prizes — they always go in the
 * lowest slot." `slotIndex` is accepted (matching the interface, and so
 * an old client payload still validates) but ignored — the server is
 * the source of truth for where it lands, not whatever the client sent.
 */
function placeNewPrizeV2(
  state: GameState,
  seat: SeatId,
  _slotIndex: number,
  rules: MintConditionRuleset = v2Ruleset,
): EngineResult {
  if (state.phase !== 'awaiting-new-prize-placement') {
    return err('NOT_AWAITING_PLACEMENT', 'No newly revealed prize is waiting to be placed.');
  }
  if (state.auction.winnerSeat !== seat) {
    return err('NOT_THE_WINNER', 'Only the auction winner may place the new prize.');
  }
  if (!state.revealedPrize) {
    return err('NO_PRIZE_TO_PLACE', 'There is no revealed prize waiting to be placed.');
  }

  const next = cloneState(state);
  const revealed = next.revealedPrize as NonNullable<GameState['revealedPrize']>;
  next.revealedPrize = null;
  next.priceSlots[0].prizes = [...next.priceSlots[0].prizes, revealed];
  pushLog(next, `${seat}'s new ${revealed.color} ${revealed.points}-point prize went into the lowest slot.`);

  return ok(concludeAuction(next, rules));
}

export const v2Ruleset: MintConditionRuleset = {
  ...v1Ruleset,
  drawPostAuctionCards: drawPostAuctionCardsV2,
  chooseAuctionReward: chooseAuctionRewardV2,
  placeNewPrize: placeNewPrizeV2,
};
