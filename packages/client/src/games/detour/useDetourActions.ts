import { useCallback } from 'react';
import type { DetourStateView } from '@denimcat/engine-detour';
import { useRoomConnection } from '../../state/useRoomConnection';

export function useDetourActions(roomCode: string, options?: { role?: string }) {
  const connection = useRoomConnection<DetourStateView>('detour', '/detour', roomCode, options);

  const playCard = useCallback(
    (value: number, target: string) => connection.sendAction('play_card', { value, target }),
    [connection],
  );

  return { ...connection, playCard };
}

export type DetourConnection = ReturnType<typeof useDetourActions>;
