import { useEffect } from 'react';
import type { RoomConnection } from './useRoomConnection';

/**
 * Keeps the browser tab title as "<game> - denimcat - <...>" so several
 * open game tabs are distinguishable at a glance. When it's your turn, it's
 * instead "Your turn! - <game> - denimcat" — leading with that so it's
 * still visible on a narrow/truncated tab — otherwise the trailing segment
 * is every other seated player's own typed name, comma-separated (a seat
 * with no name is skipped — a bare seat label like "Red" doesn't tell two
 * tabs apart). The segment is dropped entirely once neither applies (e.g.
 * still in the lobby, or nobody else has given a name).
 */
export function useDocumentTitle<TView>(
  gameDisplayName: string,
  connection: RoomConnection<TView>,
  getTurnSeat: (gameState: TView) => string | null | undefined,
) {
  useEffect(() => {
    const mySeat = connection.you && connection.you.role !== 'spectator' ? connection.you.role : null;
    const turnSeat = connection.gameState ? getTurnSeat(connection.gameState) : null;

    if (mySeat && turnSeat === mySeat) {
      document.title = `Your turn! - ${gameDisplayName} - denimcat`;
    } else {
      const opponentNames = (connection.roomInfo?.seatOrder ?? [])
        .filter((seat) => seat !== mySeat)
        .map((seat) => connection.roomInfo?.seats[seat]?.name)
        .filter((name): name is string => !!name);
      document.title = [gameDisplayName, 'denimcat', opponentNames.length > 0 ? opponentNames.join(', ') : null]
        .filter(Boolean)
        .join(' - ');
    }
    return () => {
      document.title = 'denimcat';
    };
  });
}
