export type LearningMode = 'FIRST' | 'REVIEW' | 'REPLAY';
export type AnswerChoice = 'O' | 'X';
export type AnswerOutcome = 'CORRECT' | 'WRONG' | 'TIMED_OUT';
export type LearningSessionState = 'QUESTION_ACTIVE' | 'AWAITING_ADVANCE' | 'COMPLETED';
export type DayAttemptState = 'ACTIVE' | 'PASSED' | 'RETRY_REQUIRED';
export type DayProgressState = 'NOT_STARTED' | 'IN_PROGRESS' | 'RETRY_REQUIRED' | 'PASSED';
export type NextLearningAction =
  | 'WAIT_FOR_START_DATE'
  | 'WAIT_FOR_NEXT_DAY'
  | 'CONTINUE_SESSION'
  | 'START_FIRST'
  | 'START_REPLAY'
  | 'COURSE_COMPLETE';
export type PersonalQuestionFilter = 'REVIEW_QUEUE' | 'MASTERED' | 'BOOKMARKED';
export interface LearningStatus {
  contentVersion: string;
  calendarCap: number;
  earliestUnpassedDay: number | null;
  passedDayCount: number;
  firstAnswerCount: number;
  totalXp: number;
  level: number;
  nextAction: NextLearningAction;
  activeSession: LearningSessionView | null;
}
export interface LearningSessionView {
  sessionId: string;
  contentVersion: string;
  mode: LearningMode;
  dayNumber: number | null;
  state: LearningSessionState;
  answeredCount: number;
  questionCount: number;
  question: QuestionPrompt | null;
  lastAnswer: AnswerResult | null;
}
export interface QuestionPrompt {
  questionId: number;
  dayNumber: number;
  position: number;
  text: string;
  timeLimitSeconds: number;
  deadlineAt: string;
}
export interface AnswerResult {
  attemptAnswerId: string;
  questionId: number;
  outcome: AnswerOutcome;
  correctChoice: AnswerChoice;
  explanation: string;
  xpAwarded: number;
  totalXp: number;
  level: number;
  attemptCorrectCount: number;
  attemptAnsweredCount: number;
  attemptState: DayAttemptState | null;
  dayState: DayProgressState | null;
  nextDayAvailable: boolean;
  reviewPromptEligible: boolean;
  rewardGranted?: { itemId: string; dayNumber: number; acquiredAt: string } | null;
}
export interface PersonalQuestionView {
  questionId: number;
  dayNumber: number;
  position: number;
  text: string;
  inReviewQueue: boolean;
  mastered: boolean;
  bookmarked: boolean;
  lastOutcome: AnswerOutcome | null;
  lastAnsweredAt: string | null;
}
export interface StartLearningSessionCommand {
  mode: LearningMode;
  dayNumber: number | null;
  questionIds: number[] | null;
  requestId: string;
}
export type StartTarget = Omit<StartLearningSessionCommand, 'requestId'>;
export interface SubmitAnswerCommand {
  requestId: string;
  questionId: number;
  choice: AnswerChoice;
}
export interface AdvanceLearningSessionCommand {
  requestId: string;
}
export type PendingLearningCommand =
  | { kind: 'START'; command: StartLearningSessionCommand }
  | { kind: 'ANSWER'; sessionId: string; command: SubmitAnswerCommand }
  | { kind: 'ADVANCE'; sessionId: string; command: AdvanceLearningSessionCommand };
export type LearningOperationResponse =
  | { kind: 'START' | 'ADVANCE'; view: LearningSessionView }
  | { kind: 'ANSWER'; sessionId: string; answer: AnswerResult };
