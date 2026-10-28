import { dealGame, toView, type DetourConfig, type GameState, type PlayerCount, type SeatId } from '@denimcat/engine-detour';
import type { GameModule } from '@denimcat/platform';
import { registerDetourHandlers } from './gameHandlers';

const ALL_SEATS: SeatId[] = ['p1', 'p2', 'p3', 'p4'];

function isPlayerCount(value: unknown): value is PlayerCount {
  return value === 2 || value === 3 || value === 4;
}

export const detourModule: GameModule<GameState, DetourConfig, SeatId> = {
  id: 'detour',
  displayName: 'Detour',
  namespace: '/detour',
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
  registerHandlers: registerDetourHandlers,

  toView,

  getActiveSeat(state) {
    return state.phase === 'ended' ? null : state.activeSeat;
  },
  isRoomFinished: (state) => state.phase === 'ended',
  roomUrlPath: (code) => `/detour/room/${code}`,
};
