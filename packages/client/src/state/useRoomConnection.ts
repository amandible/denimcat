import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { clearSeat, loadSeat, saveSeat } from './seatToken';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000';

export type Status = 'connecting' | 'picking-role' | 'in-room';

export interface RoomInfo {
  code: string;
  seats: Record<string, { connected: boolean } | undefined>;
  spectatorCount: number;
}

export interface RoomConnection<TView> {
  status: Status;
  you: { role: string } | null;
  gameState: TView | null;
  roomInfo: RoomInfo | null;
  lastError: string | null;
  joinAs: (role: string) => void;
  leaveSeat: () => void;
  /** Generic action escape hatch: emits `event` with `{roomCode, ...payload}` and just surfaces any error. */
  sendAction: (event: string, payload?: Record<string, unknown>) => void;
}

/**
 * The generic room-lifecycle connection shared by every game: connect to a
 * given Socket.io namespace, join/reconnect/leave, seat-token persistence,
 * and room_update/game_state/error handling. Game-specific verbs and extra
 * server-pushed events (e.g. Hyper Bloom's `legal_moves`) are layered on top
 * by each game's own thin wrapper hook via `extraListeners`.
 */
export function useRoomConnection<TView>(
  gameSlug: string,
  namespace: string,
  roomCode: string,
  options: { extraListeners?: Record<string, (payload: any) => void> } = {},
): RoomConnection<TView> {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [you, setYou] = useState<{ role: string } | null>(null);
  const [gameState, setGameState] = useState<TView | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const extraListenersRef = useRef(options.extraListeners);
  extraListenersRef.current = options.extraListeners;

  useEffect(() => {
    const socket = io(`${SERVER_URL}${namespace}`, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      const stored = loadSeat(gameSlug, roomCode);
      if (!stored) {
        setStatus('picking-role');
        return;
      }
      socket.emit('reconnect_room', { roomCode, role: stored.role, seatToken: stored.seatToken }, (res: any) => {
        if (res.ok) {
          setGameState(res.gameState);
          setYou(res.you);
          setStatus('in-room');
          setLastError(null);
        } else {
          clearSeat(gameSlug, roomCode);
          setLastError(res.error.message);
          setStatus('picking-role');
        }
      });
    });

    socket.on('game_state', setGameState as any);
    socket.on('room_update', setRoomInfo as any);
    socket.on('error', (err: any) => setLastError(err.message));

    const extra = extraListenersRef.current ?? {};
    for (const [event, handler] of Object.entries(extra)) {
      socket.on(event, handler);
    }

    return () => {
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSlug, namespace, roomCode]);

  const joinAs = useCallback(
    (role: string) => {
      socketRef.current?.emit('join_room', { roomCode, role }, (res: any) => {
        if (!res.ok) {
          setLastError(res.error.message);
          return;
        }
        setGameState(res.gameState);
        setYou(res.you);
        setStatus('in-room');
        setLastError(null);
        if (res.seatToken && role !== 'spectator') {
          saveSeat(gameSlug, roomCode, { role, seatToken: res.seatToken });
        }
      });
    },
    [gameSlug, roomCode],
  );

  const leaveSeat = useCallback(() => {
    socketRef.current?.emit('leave_seat', { roomCode }, () => {
      clearSeat(gameSlug, roomCode);
      setYou(null);
      setStatus('picking-role');
    });
  }, [gameSlug, roomCode]);

  const sendAction = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      socketRef.current?.emit(event, { roomCode, ...payload }, (res: any) => {
        if (res.ok) setLastError(null);
        else setLastError(res.error.message);
      });
    },
    [roomCode],
  );

  return { status, you, gameState, roomInfo, lastError, joinAs, leaveSeat, sendAction };
}
