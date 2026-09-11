import {
  dealGame,
  type GameState,
  type LoveTrianglesConfig,
  type LoveTrianglesEvent,
  type PlayerCount,
  type SeatId,
} from '@denimcat/engine-love-triangles';
import type { GameModule } from '@denimcat/platform';
import { registerLoveTrianglesHandlers } from './gameHandlers';

const ALL_SEATS: SeatId[] = ['p1', 'p2', 'p3', 'p4'];

function isPlayerCount(value: unknown): value is PlayerCount {
  return value === 2 || value === 3 || value === 4;
}

export const loveTrianglesModule: GameModule<GameState, LoveTrianglesConfig, SeatId> = {
  id: 'love-triangles',
  displayName: 'Love Triangles',
  namespace: '/love-triangles',
  minSeats: 2,
  maxSeats: 4,

  parseConfig(raw) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { playerCount } = raw as Record<string, unknown>;
    return isPlayerCount(playerCount) ? { playerCount } : null;
  },
  seatsForConfig(config) {
    return ALL_SEATS.slice(0, config.playerCount);
  },
  createInitialState(config, rng) {
    return dealGame(config.playerCount, rng);
  },
  registerHandlers: registerLoveTrianglesHandlers,

  // No toView: no hidden information at all (confirmed with the
  // designer), so RoomStore just broadcasts the full state to everyone.

  // buyLink's own EngineResult.data carries an ordered event log (what
  // happened, step by step) for the client to animate through instead of
  // snapping straight to the final state — see engine-love-triangles's
  // events.ts. Broadcast room-wide (not per-seat) since there's nothing
  // to redact and spectators should see the same animation everyone else does.
  afterMutation({ data, broadcastToRoom }) {
    const events = (data as { events?: LoveTrianglesEvent[] } | undefined)?.events;
    if (events?.length) broadcastToRoom('love_triangles_events', events);
  },
};
