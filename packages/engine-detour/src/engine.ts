import type { CellId } from './board';
import { directionFor } from './decks';
import { resolveChain } from './movement';
import { isLegalPlacement } from './placement';
import { err, ok } from './result';
import { computeFinalScores, determineWinners, isGameOver } from './scoring';
import { cloneState, pushLog } from './state';
import type { EngineResult, GameState, SeatId } from './types';

export function playCard(state: GameState, seat: SeatId, value: number, target: CellId): EngineResult {
  if (seat !== state.activeSeat) {
    return err('NOT_YOUR_TURN', `It is not ${seat}'s turn.`);
  }
  const player = state.players[seat];
  if (!player.hand.includes(value)) {
    return err('CARD_NOT_IN_HAND', `${seat} does not hold card ${value}.`);
  }
  if (!isLegalPlacement(state, value, target)) {
    return err('ILLEGAL_PLACEMENT', `${value} cannot be played on ${target}.`);
  }

  const next = cloneState(state);
  const nextPlayer = next.players[seat];
  nextPlayer.hand = nextPlayer.hand.filter((v) => v !== value);
  next.cells[target] = { value, owner: seat };
  pushLog(next, `${seat} played ${value} on ${target}.`);

  const { pawnCell, pointsScored } = resolveChain(next, seat, directionFor(nextPlayer.deckId, value));
  next.pawnCell = pawnCell;
  nextPlayer.score += pointsScored;
  if (pointsScored > 0) {
    pushLog(next, `${seat} scored ${pointsScored} point${pointsScored > 1 ? 's' : ''}; the pawn is now on ${pawnCell}.`);
  }

  if (nextPlayer.deck.length > 0) {
    const drawn = nextPlayer.deck.pop()!;
    nextPlayer.hand = [...nextPlayer.hand, drawn];
  }

  if (isGameOver(next)) {
    const finalScores = computeFinalScores(next);
    for (const s of next.seats) {
      next.players[s].score = finalScores[s];
    }
    next.winner = determineWinners(finalScores);
    next.phase = 'ended';
    pushLog(next, next.winner.length > 1 ? `Shared victory: ${next.winner.join(', ')}.` : `${next.winner[0]} wins!`);
  } else {
    const idx = next.seats.indexOf(seat);
    next.activeSeat = next.seats[(idx + 1) % next.seats.length];
  }

  return ok(next);
}
