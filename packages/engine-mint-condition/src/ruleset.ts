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
/**
 * v3's consolation-reward choice: the "add a prize" toggle is dropped
 * entirely (confirmed with the designer — v3 keeps only the accelerate
 * option), so this is its own shape rather than a subset of
 * AuctionRewardChoiceV2.
 */
export interface AuctionRewardChoiceV3 {
  extraShift: boolean;
}

export interface MintConditionRuleset {
  drawPostAuctionCards(state: GameState, winnerSeat: SeatId, firstPasserSeat: SeatId | null): GameState;
  /**
   * `reward`'s type grew to a union the moment v2 actually needed a
   * differently-shaped payload (see AuctionRewardChoiceV2) — v1's own
   * implementation only ever handles the AuctionReward half of it. Grew
   * again for v3's own shape (AuctionRewardChoiceV3).
   */
  chooseAuctionReward(
    state: GameState,
    seat: SeatId,
    reward: AuctionReward | AuctionRewardChoiceV2 | AuctionRewardChoiceV3,
    rules?: MintConditionRuleset,
  ): EngineResult;
  placeNewPrize(state: GameState, seat: SeatId, slotIndex: number, rules?: MintConditionRuleset): EngineResult;
  /**
   * What happens when every seat passes without anyone ever bidding —
   * v1/v2: nothing (no-op). New seam for v3, whose universal per-round draw
   * extends to a no-bid round too (confirmed with the designer).
   */
  drawCardsOnNoWinner(state: GameState): GameState;
  /**
   * Both the game-over trigger and its resolution — v1/v2: isGameOver's
   * trigger (deck AND every slot empty) plus a plain highest-score winner.
   * New seam for v3, whose trigger and resolution are both different (see
   * endgame.ts's applyGameEndIfDoneV3).
   */
  applyGameEndIfDone(state: GameState): GameState;
}
