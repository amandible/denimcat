import {
  dealGame,
  toView,
  type GameState,
  type MintConditionConfig,
  type PlayerCount,
  type SeatId,
} from '@denimcat/engine-mint-condition';
import type { GameModule } from '@denimcat/platform';
import { registerMintConditionHandlers } from './gameHandlers';

const ALL_SEATS: SeatId[] = ['p1', 'p2', 'p3', 'p4'];

function isPlayerCount(value: unknown): value is PlayerCount {
  return value === 2 || value === 3 || value === 4;
}

export const mintConditionModule: GameModule<GameState, MintConditionConfig, SeatId> = {
  id: 'mint-condition',
  displayName: 'Mint Condition',
  namespace: '/mint-condition',
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
  registerHandlers: registerMintConditionHandlers,

  // Real hidden information (blind personal-deck draws, hidden bid cards),
  // so every viewer gets a redacted, per-seat view rather than a broadcast.
  toView,

  // No afterMutation: legal bid options are computed client-side from the
  // viewer's own redacted hand + the public current-bid amount, so no
  // extra targeted server push is needed the way Hyper Bloom's legal_moves is.
};
