/**
 * TODO: designer to write the actual question text (see this project's own
 * standing instruction against inventing this kind of copy). Ids are
 * stable so a future wording tweak never orphans an already-submitted
 * answer — see SurveyResponse.questionId in @denimcat/platform.
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
