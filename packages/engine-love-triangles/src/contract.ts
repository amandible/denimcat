import type { ActionResult, RoomLifecycleClientToServerEvents, RoomLifecycleServerToClientEvents } from '@denimcat/shared';
import type { GameState, LinkId, PlayerCount, SeatId } from './types';
import type { LoveTrianglesEvent } from './events';

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

export interface ServerToClientEvents extends RoomLifecycleServerToClientEvents<SeatId, GameState> {
  /** The ordered log of what happened during a buy_link mutation, for the client to animate through — see events.ts. */
  love_triangles_events: (payload: LoveTrianglesEvent[]) => void;
}
