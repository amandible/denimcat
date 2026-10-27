/**
 * TODO: designer to write the actual question text (see this project's own
 * standing instruction against inventing this kind of copy). Ids are
 * stable so a future wording tweak never orphans an already-submitted
 * answer — see SurveyResponse.questionId below.
 */
export interface StandardSurveyQuestion {
  id: string;
  text: string;
}

export const STANDARD_SURVEY_QUESTIONS: StandardSurveyQuestion[] = [
  { id: 'fun', text: 'TODO: question text' },
  { id: 'not-fun', text: 'TODO: question text' },
  { id: 'memorable', text: 'TODO: question text' },
];

/**
 * One answer to one standard question, from one seat, in one room. Lives
 * in @denimcat/shared (not @denimcat/platform, which owns SurveyRepository
 * itself) because both the server (submitting/listing) and the client
 * (NotesView, the owner-only playtest-notes page) need this shape —
 * same reasoning as ChatMessage living here rather than in platform.
 * Independent of the room's own lifecycle (see roomId's doc comment on
 * PersistedRoom in @denimcat/platform) — a response must survive its room
 * being deleted, so there's deliberately no foreign key back to `rooms`.
 */
export interface SurveyResponse {
  gameId: string;
  /** The room's durable identity — see PersistedRoom.roomId. Never the recyclable 4-character room code. */
  roomId: string;
  /** Kept for display only (e.g. "the Tuesday game") — never used for uniqueness or lookups, since it can be reused after deletion. */
  roomCode: string;
  seat: string;
  accountEmail: string;
  questionId: string;
  answer: string;
  createdAt: number;
}
