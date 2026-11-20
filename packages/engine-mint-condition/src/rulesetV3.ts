import type { AuctionRewardChoiceV2, AuctionRewardChoiceV3, MintConditionRuleset } from './ruleset';
import type { EngineResult, GameState, SeatId } from './types';
import { ok, err } from './result';
import { pushLog } from './state';
import { drawCardForSeatWithReshuffle, drawPostAuctionCardsV3 } from './decks';
import { afterPrizeChoice, eligibleTakeSlotIndex, shiftDisplay, slotIndexForBid, type AuctionReward } from './prizes';
import { applyGameEndIfDoneV3 } from './endgame';
import { v2Ruleset } from './rulesetV2';

/**
 * v3's card-draw tier: 1 for below the lowest slot's price, 2 for the
 * bottom two slots, 3 for the middle two, 4 for the top two — one more tier
 * than v2's cardsForRewardTier, which lumped "below the lowest" in with the
 * bottom two slots at 2. `slotIndex` is slotIndexForBid's result.
 */
export function cardsForRewardTierV3(slotIndex: number | null): number {
  if (slotIndex === null) return 1;
  if (slotIndex <= 1) return 2;
  if (slotIndex <= 3) return 3;
  return 4;
}

/** v3: every seat draws one card even when nobody ever bid (extends the universal per-round draw to a no-bid round too). */
function drawCardsOnNoWinnerV3(state: GameState, rng: () => number = Math.random): GameState {
  let next = state;
  for (const seat of state.seats) {
    next = drawCardForSeatWithReshuffle(next, seat, rng);
  }
  return next;
}

/**
 * v3: the guaranteed card draw now uses cardsForRewardTierV3's 4-tier
 * table, and the "add a prize" toggle is gone entirely — confirmed with the
 * designer, the only remaining optional extra is accelerating the display.
 */
function chooseAuctionRewardV3(
  state: GameState,
  seat: SeatId,
  reward: AuctionReward | AuctionRewardChoiceV2 | AuctionRewardChoiceV3,
  rules: MintConditionRuleset = v3Ruleset,
  rng: () => number = Math.random,
): EngineResult {
  if (state.phase !== 'awaiting-prize-choice') {
    return err('NOT_AWAITING_PRIZE_CHOICE', 'No prize is currently waiting to be chosen.');
  }
  if (state.auction.winnerSeat !== seat) {
    return err('NOT_THE_WINNER', 'Only the auction winner may choose a reward.');
  }
  if (typeof reward !== 'object' || reward === null || 'addPrize' in reward) {
    return err('INVALID_REWARD', 'This room expects the v3 reward choice shape.');
  }

  const bidAmount = (state.auction.highestBid as NonNullable<GameState['auction']['highestBid']>).amount;
  if (eligibleTakeSlotIndex(state.priceSlots, bidAmount) !== null) {
    return err('AFFORDABLE_PRIZE_AVAILABLE', 'At least one displayed prize is affordable and must be taken instead.');
  }

  const slotIndex = slotIndexForBid(state.priceSlots, bidAmount);
  const cardCount = cardsForRewardTierV3(slotIndex);

  let next = state;
  for (let i = 0; i < cardCount; i++) next = drawCardForSeatWithReshuffle(next, seat, rng);
  pushLog(next, `${seat} took no prize this round — drew ${cardCount} cards instead.`);

  if ((reward as AuctionRewardChoiceV3).extraShift) {
    next = shiftDisplay(next);
    pushLog(next, `${seat} also shifted the display an extra space.`);
  }

  return ok(afterPrizeChoice(next, rules));
}

export const v3Ruleset: MintConditionRuleset = {
  ...v2Ruleset,
  drawPostAuctionCards: drawPostAuctionCardsV3,
  chooseAuctionReward: chooseAuctionRewardV3,
  drawCardsOnNoWinner: drawCardsOnNoWinnerV3,
  applyGameEndIfDone: applyGameEndIfDoneV3,
};
