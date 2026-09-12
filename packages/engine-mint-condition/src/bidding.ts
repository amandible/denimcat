import type { EngineResult, GameState, SeatId } from './types';
import { cloneState, startAuction } from './state';
import { ok, err } from './result';
import { shiftDisplay } from './prizes';
import { applyGameEndIfDone } from './scoring';

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

/**
 * Runs after every bid/pass: resolves the auction if only one seat hasn't
 * passed (they win if they're the highest bidder, or if literally nobody
 * ever bid, the auction ends with no winner), otherwise advances to the
 * next non-passed seat.
 */
function advanceAuction(state: GameState): GameState {
  const nonPassed = state.seats.filter((s) => !state.auction.passedSeats.includes(s));

  if (nonPassed.length === 0) {
    return resolveAuctionNoWinner(state);
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

export function placeBid(state: GameState, seat: SeatId, cards: number[]): EngineResult {
  const turnError = isSeatsTurn(state, seat);
  if (turnError) return turnError;

  if (cards.length === 0) return err('EMPTY_BID', 'A bid must spend at least one card.');
  const hand = state.players[seat].hand;
  const uniqueCards = new Set(cards);
  if (uniqueCards.size !== cards.length) return err('DUPLICATE_CARD', 'A bid cannot repeat the same card.');
  for (const value of cards) {
    if (!hand.includes(value)) return err('CARD_NOT_IN_HAND', 'That card is not in this seat\'s hand.');
  }

  const amount = cards.reduce((a, b) => a + b, 0);
  const threshold = state.auction.highestBid?.amount ?? 0;
  if (amount <= threshold) return err('BID_TOO_LOW', 'A bid must exceed the current highest bid.');

  let next = cloneState(state);
  next.auction.highestBid = { seat, cardValues: [...cards].sort((a, b) => a - b), amount };
  next = advanceAuction(next);
  return ok(next);
}

export function pass(state: GameState, seat: SeatId): EngineResult {
  const turnError = isSeatsTurn(state, seat);
  if (turnError) return turnError;

  let next = cloneState(state);
  next.auction.passedSeats = [...next.auction.passedSeats, seat];
  next = advanceAuction(next);
  return ok(next);
}

/** Discards the winner's committed cards and opens the prize-choice step. Always succeeds given its preconditions. */
export function resolveAuctionWin(state: GameState): GameState {
  const next = cloneState(state);
  const bid = next.auction.highestBid as NonNullable<GameState['auction']['highestBid']>;
  next.auction.winnerSeat = bid.seat;
  const player = next.players[bid.seat];
  player.hand = player.hand.filter((c) => !bid.cardValues.includes(c));
  next.phase = 'awaiting-prize-choice';
  return next;
}

/**
 * Every seat passed without anyone ever bidding: no cards drawn, no new
 * prize revealed, but the display still shifts exactly as it would after a
 * normal auction. The next auction's opener rotates to the next seat.
 */
export function resolveAuctionNoWinner(state: GameState): GameState {
  let next = shiftDisplay(state);
  next = applyGameEndIfDone(next);
  if (next.phase === 'ended') return next;

  next = cloneState(next);
  const seats = next.seats;
  const prevOpenerIdx = seats.indexOf(next.auction.openerSeat);
  const nextOpener = seats[(prevOpenerIdx + 1) % seats.length];
  next.auction = startAuction(seats, nextOpener);
  next.phase = 'auction-active';
  return next;
}
