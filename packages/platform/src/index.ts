export * from './gameModule';
export { RoomStore, type RoomStoreOptions } from './rooms/roomStore';
export {
  type PersistedRoom,
  type PersistedSeat,
  type RoomRepository,
  InMemoryRoomRepository,
  PostgresRoomRepository,
  createDefaultRoomRepository,
  parsePersistedRoomData,
} from './rooms/roomRepository';
export { generateRoomCode } from './rooms/roomCode';
export { getDb, ensureSchema } from './db/client';
export { isNonEmptyString } from './socket/validate';
export { registerRoomHandlers } from './socket/roomHandlers';
export { attachSocketHandlers } from './socket/attach';
