import { useEffect } from 'react';
import type { RoomConnection } from './useRoomConnection';

/**
 * Keeps the browser tab title as "<game> - denimcat - <...>" so several
 * open game tabs are distinguishable at a glance. The third segment is
 * "Your turn!" whenever it's your turn; otherwise it's every other seated
 * player's own typed name, comma-separated (a seat with no name is
 * skipped — a bare seat label like "Red" doesn't tell two tabs apart).
 * The segment is dropped entirely once neither applies (e.g. still in the
 * lobby, or nobody else has given a name).
 */
export function useDocumentTitle<TView>(
  gameDisplayName: string,
  connection: RoomConnection<TView>,
  getTurnSeat: (gameState: TView) => string | null | undefined,
) {
  useEffect(() => {
    const mySeat = connection.you && connection.you.role !== 'spectator' ? connection.you.role : null;
    const turnSeat = connection.gameState ? getTurnSeat(connection.gameState) : null;

    let thirdSegment: string | null = null;
    if (mySeat && turnSeat === mySeat) {
      thirdSegment = 'Your turn!';
    } else {
      const opponentNames = (connection.roomInfo?.seatOrder ?? [])
        .filter((seat) => seat !== mySeat)
        .map((seat) => connection.roomInfo?.seats[seat]?.name)
        .filter((name): name is string => !!name);
      if (opponentNames.length > 0) thirdSegment = opponentNames.join(', ');
    }

    document.title = [gameDisplayName, 'denimcat', thirdSegment].filter(Boolean).join(' - ');
    return () => {
      document.title = 'denimcat';
    };
  });
}
