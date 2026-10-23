import { useEffect, useRef } from 'react';
import type { RoomConnection } from './useRoomConnection';
import { playTurnChime } from './chime';

/**
 * Plays a short chime the moment it becomes your turn, for as long as this
 * tab stays open on the room — e.g. your opponent just moved. Only on an
 * observed false->true transition (tracked via a ref), not on every render
 * where it's already your turn, which would replay the chime on every
 * unrelated gameState update — and, just as important, not on the very
 * first observation once connected/seated, which would otherwise chime on
 * every page load/refresh that happens to land on your own turn (nothing
 * "became" true there, it already was). The ref starts at `null` and is
 * only ever set once real seat+gameState info exists, so the first such
 * render always just establishes the baseline silently. Mirrors
 * useDocumentTitle's exact "is it my turn right now" check, so the two
 * always agree — not wired into hotseat play, where one browser holds
 * every seat and "my turn" is permanently true.
 */
export function useTurnChime<TView>(
  connection: RoomConnection<TView>,
  getTurnSeat: (gameState: TView) => string | null | undefined,
) {
  const wasMyTurnRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!connection.gameState || !connection.you || connection.you.role === 'spectator') return;
    const isMyTurn = getTurnSeat(connection.gameState) === connection.you.role;
    if (wasMyTurnRef.current !== null && isMyTurn && !wasMyTurnRef.current) {
      playTurnChime();
    }
    wasMyTurnRef.current = isMyTurn;
  });
}
