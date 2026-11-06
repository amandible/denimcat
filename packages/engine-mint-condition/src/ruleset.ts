import type { AuctionReward } from './prizes';
import type { EngineResult, GameState, SeatId } from './types';

/**
 * v2's consolation-reward choice: the card draw is now unconditional (see
 * MintConditionRuleset.chooseAuctionReward's doc comment), so the only
 * remaining choices are two independent optional extras — replacing v1's
 * single three-way pick (AuctionReward). This is exactly the kind of
 * seam that couldn't have been predicted when v1 shipped: the payload
 * shape itself needed to change, not just a function body. See
 * docs/guides/game-rule-versions.md.
 */
export interface AuctionRewardChoiceV2 {
  extraShift: boolean;
  addPrize: boolean;
}

/**
 * The overridable surface of Mint Condition's rules — deliberately NOT
 * "every exported function," only the ones a real second version has
 * actually needed to vary (or needs to call through to reach one that
 * does). See docs/guides/game-rule-versions.md for the authoring
 * practice this supports: grow this interface only when a real version
 * needs a new seam, never speculatively ahead of time.
 */
export interface MintConditionRuleset {
  drawPostAuctionCards(state: GameState, winnerSeat: SeatId, firstPasserSeat: SeatId | null): GameState;
  /**
   * `reward`'s type grew to a union the moment v2 actually needed a
   * differently-shaped payload (see AuctionRewardChoiceV2) — v1's own
   * implementation only ever handles the AuctionReward half of it.
   */
  chooseAuctionReward(state: GameState, seat: SeatId, reward: AuctionReward | AuctionRewardChoiceV2, rules?: MintConditionRuleset): EngineResult;
  placeNewPrize(state: GameState, seat: SeatId, slotIndex: number, rules?: MintConditionRuleset): EngineResult;
}
