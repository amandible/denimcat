export { dealGame } from './setup';
export { pass, buyLink } from './actions';
export { refillDisplay, sweepUnplayable } from './display';
export { effectiveCost, isPresent, type CostBreakdown } from './presence';
export {
  scoreForPlayer,
  computeFinalScores,
  determineWinners,
  isGameOver,
  applyGameEndIfDone,
} from './scoring';
export { CROSSES } from './geometry';
export { NODES, LINKS, linkId, type LinkDef } from './maps/map1';
export type { LoveTrianglesEvent, PurchasedEvent, RefilledEvent, RemovedUnplayableEvent } from './events';
