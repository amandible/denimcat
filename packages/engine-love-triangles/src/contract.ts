import type { ActionResult, RoomLifecycleClientToServerEvents, RoomLifecycleServerToClientEvents } from '@denimcat/shared';
import type { GameState, LinkId, PlayerCount, SeatId } from './types';

export interface LoveTrianglesConfig {
  playerCount: PlayerCount;
}

/**
 * Unlike Mint Condition, Love Triangles has no hidden information at all —
 * confirmed with the designer (gems, network, and display are all fully
 * public). So, like Hyper Bloom, the raw `GameState` is sent to clients
 * directly; there's no `toView` redaction step.
 */
export interface ClientToServerEvents
  extends RoomLifecycleClientToServerEvents<SeatId, LoveTrianglesConfig, GameState> {
  pass: (payload: { roomCode: string }, cb: (res: ActionResult) => void) => void;
  buy_link: (payload: { roomCode: string; linkId: LinkId }, cb: (res: ActionResult) => void) => void;
}

export type ServerToClientEvents = RoomLifecycleServerToClientEvents<SeatId, GameState>;
