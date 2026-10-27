export * from './gameModule';
export { type EmailSender, createDefaultEmailSender, createNoopEmailSender, createResendEmailSender } from './email';
export { RoomStore, type RoomStoreOptions, type OpenGameSummary } from './rooms/roomStore';
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
export {
  type AuthRepository,
  InMemoryAuthRepository,
  PostgresAuthRepository,
  createDefaultAuthRepository,
} from './auth/authRepository';
export { type AuthService, createAuthService } from './auth/authService';
export {
  type SurveyResponse,
  type SurveyRepository,
  InMemorySurveyRepository,
  PostgresSurveyRepository,
  createDefaultSurveyRepository,
} from './surveys/surveyRepository';
export { isNonEmptyString } from './socket/validate';
export { registerRoomHandlers } from './socket/roomHandlers';
export { attachSocketHandlers } from './socket/attach';
