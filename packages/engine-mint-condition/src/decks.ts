import type { GameState, SeatId } from './types';
import { cloneState } from './state';

/** No-op (not an error) once a seat's personal deck is exhausted. */
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
