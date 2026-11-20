import type { GameState, SeatId } from './types';
import { cloneState, shuffle } from './state';

/** No-op (not an error) once a seat's personal deck is exhausted — v1/v2 only; see drawCardForSeatWithReshuffle for v3. */
export function drawCardForSeat(state: GameState, seat: SeatId): GameState {
  const next = cloneState(state);
  const player = next.players[seat];
  if (player.deck.length === 0) return next;
  const card = player.deck.pop() as number;
  player.hand = [...player.hand, card];
  return next;
}

/** The auction's winner and the seat that passed first each draw one card. */
export function drawPostAuctionCards(state: GameState, winnerSeat: SeatId, firstPasserSeat: SeatId | null): GameState {
  let next = drawCardForSeat(state, winnerSeat);
  if (firstPasserSeat && firstPasserSeat !== winnerSeat) {
    next = drawCardForSeat(next, firstPasserSeat);
  }
  return next;
}

/**
 * v3: once a seat's deck is exhausted, its discard pile is shuffled into a
 * fresh deck before drawing — a seat is only truly out of cards once both
 * are empty. Introduced in v3; v1/v2 keep drawCardForSeat's plain no-op
 * since those versions never populate a discard pile to reshuffle from.
 */
export function drawCardForSeatWithReshuffle(state: GameState, seat: SeatId, rng: () => number = Math.random): GameState {
  const next = cloneState(state);
  const player = next.players[seat];
  if (player.deck.length === 0) {
    if (player.discard.length === 0) return next;
    player.deck = shuffle(player.discard, rng);
    player.discard = [];
  }
  const card = player.deck.pop() as number;
  player.hand = [...player.hand, card];
  return next;
}

/** v3: every seat draws one card after an auction, regardless of who won or passed. */
export function drawPostAuctionCardsV3(
  state: GameState,
  _winnerSeat: SeatId,
  _firstPasserSeat: SeatId | null,
  rng: () => number = Math.random,
): GameState {
  let next = state;
  for (const seat of state.seats) {
    next = drawCardForSeatWithReshuffle(next, seat, rng);
  }
  return next;
}
