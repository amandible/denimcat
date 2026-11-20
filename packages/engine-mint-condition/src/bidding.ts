import type { EngineResult, GameState, SeatId } from './types';
import type { MintConditionRuleset } from './ruleset';
import { cloneState, pushLog, startAuction } from './state';
import { ok, err } from './result';
import { shiftDisplay, v1Ruleset } from './prizes';

export interface BidOption {
  amount: number;
  cards: number[];
}

/**
 * Every non-empty subset of a hand that beats `threshold`, each a
 * separately selectable option (two different combinations that happen to
 * sum to the same amount are two distinct options, not one). A hand has at
 * most 13 cards, so this is a trivial 2^n enumeration.
 *
 * Deliberately decoupled from `GameState` (unlike most of this engine's
 * functions) so the client can call it directly with just the viewer's own
 * hand and the public current-bid amount — both already present in their
 * redacted view — without needing the full internal state it never has.
 */
export function bidOptionsForHand(hand: number[], threshold: number): BidOption[] {
  const options: BidOption[] = [];
  const n = hand.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const cards: number[] = [];
    let amount = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        cards.push(hand[i]);
        amount += hand[i];
      }
    }
    if (amount > threshold) {
      options.push({ amount, cards: cards.sort((a, b) => a - b) });
    }
  }
  return options;
}

export function getLegalBidOptions(state: GameState, seat: SeatId): BidOption[] {
  const hand = state.players[seat].hand;
  const threshold = state.auction.highestBid?.amount ?? 0;
  return bidOptionsForHand(hand, threshold);
}

function isSeatsTurn(state: GameState, seat: SeatId): EngineResult | null {
  if (state.phase !== 'auction-active') return err('NOT_AUCTION_ACTIVE', 'No auction is currently active.');
  if (state.auction.activeSeat !== seat) return err('NOT_YOUR_TURN', 'It is not this seat\'s turn to act.');
  return null;
}

function countByValue(values: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
}

/**
 * True when `cards` could actually be paid from `hand` — counting how many
 * of each VALUE are used, not just whether the value appears at all. A
 * plain `hand.includes(value)` check (fine under v1/v2's unique 1-13 deck)
 * would wrongly accept spending more copies of a value than the hand holds
 * once v3's money deck can repeat a value (four 10s, four 5s, four 1s).
 */
function isAffordableFromHand(cards: number[], hand: number[]): boolean {
  const handCounts = countByValue(hand);
  for (const [value, needed] of countByValue(cards)) {
    if ((handCounts.get(value) ?? 0) < needed) return false;
  }
  return true;
}

/**
 * Removes exactly the spent cards from `hand` — one occurrence per entry in
 * `cardsToRemove`, not every occurrence of a repeated value. Spending one
 * of a player's two 10s must leave the other 10 in hand.
 */
function removeCardsFromHand(hand: number[], cardsToRemove: number[]): number[] {
  const remaining = [...hand];
  for (const value of cardsToRemove) {
    const idx = remaining.indexOf(value);
    // Unreachable given placeBid's own isAffordableFromHand check already confirmed availability.
    if (idx !== -1) remaining.splice(idx, 1);
  }
  return remaining;
}

/**
 * Runs after every bid/pass: resolves the auction if only one seat hasn't
 * passed (they win if they're the highest bidder, or if literally nobody
 * ever bid, the auction ends with no winner), otherwise advances to the
 * next non-passed seat.
 */
function advanceAuction(state: GameState, rules: MintConditionRuleset): GameState {
  const nonPassed = state.seats.filter((s) => !state.auction.passedSeats.includes(s));

  if (nonPassed.length === 0) {
    return resolveAuctionNoWinner(state, rules);
  }
  if (nonPassed.length === 1 && state.auction.highestBid?.seat === nonPassed[0]) {
    return resolveAuctionWin(state);
  }

  const next = cloneState(state);
  const order = next.auction.turnOrder;
  const currentIdx = order.indexOf(next.auction.activeSeat);
  for (let step = 1; step <= order.length; step++) {
    const candidate = order[(currentIdx + step) % order.length];
    if (!next.auction.passedSeats.includes(candidate)) {
      next.auction.activeSeat = candidate;
      break;
    }
  }
  return next;
}

export function placeBid(state: GameState, seat: SeatId, cards: number[], rules: MintConditionRuleset = v1Ruleset): EngineResult {
  const turnError = isSeatsTurn(state, seat);
  if (turnError) return turnError;

  if (cards.length === 0) return err('EMPTY_BID', 'A bid must spend at least one card.');
  const hand = state.players[seat].hand;
  if (!isAffordableFromHand(cards, hand)) {
    return err('CARD_NOT_IN_HAND', 'That card is not in this seat\'s hand.');
  }

  const amount = cards.reduce((a, b) => a + b, 0);
  const threshold = state.auction.highestBid?.amount ?? 0;
  if (amount <= threshold) return err('BID_TOO_LOW', 'A bid must exceed the current highest bid.');

  let next = cloneState(state);
  next.auction.highestBid = { seat, cardValues: [...cards].sort((a, b) => a - b), amount };
  pushLog(next, `${seat} bid ${amount}.`);
  next = advanceAuction(next, rules);
  return ok(next);
}

export function pass(state: GameState, seat: SeatId, rules: MintConditionRuleset = v1Ruleset): EngineResult {
  const turnError = isSeatsTurn(state, seat);
  if (turnError) return turnError;

  let next = cloneState(state);
  next.auction.passedSeats = [...next.auction.passedSeats, seat];
  pushLog(next, `${seat} passed.`);
  next = advanceAuction(next, rules);
  return ok(next);
}

/**
 * Moves the winner's committed cards from hand to their discard pile (not
 * erased — v3's drawCardForSeatWithReshuffle reshuffles a discard pile back
 * into an empty deck; v1/v2 never read it) and opens the prize-choice step.
 * Always succeeds given its preconditions.
 */
export function resolveAuctionWin(state: GameState): GameState {
  const next = cloneState(state);
  const bid = next.auction.highestBid as NonNullable<GameState['auction']['highestBid']>;
  next.auction.winnerSeat = bid.seat;
  const player = next.players[bid.seat];
  player.hand = removeCardsFromHand(player.hand, bid.cardValues);
  player.discard = [...player.discard, ...bid.cardValues];
  next.phase = 'awaiting-prize-choice';
  pushLog(next, `${bid.seat} won the auction for ${bid.amount}.`);
  return next;
}

/**
 * Every seat passed without anyone ever bidding: v1/v2 draw no cards and
 * reveal no new prize, but the display still shifts exactly as it would
 * after a normal auction; v3's drawCardsOnNoWinner extends the universal
 * per-round draw to this case too (confirmed with the designer). The next
 * auction's opener rotates to the next seat.
 */
export function resolveAuctionNoWinner(state: GameState, rules: MintConditionRuleset = v1Ruleset): GameState {
  let next = shiftDisplay(state);
  next = rules.drawCardsOnNoWinner(next);
  pushLog(next, 'Nobody bid — the auction closed with no winner.');
  next = rules.applyGameEndIfDone(next);
  if (next.phase === 'ended' || next.phase === 'awaiting-endgame-prize-choice') return next;

  next = cloneState(next);
  const seats = next.seats;
  const prevOpenerIdx = seats.indexOf(next.auction.openerSeat);
  const nextOpener = seats[(prevOpenerIdx + 1) % seats.length];
  next.auction = startAuction(seats, nextOpener);
  next.phase = 'auction-active';
  return next;
}
