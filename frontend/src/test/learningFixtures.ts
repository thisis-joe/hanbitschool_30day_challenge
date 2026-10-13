import type {
  AnswerResult,
  LearningSessionView,
  LearningStatus,
  PersonalQuestionView,
} from '../features/learning/types';

export const sessionId = '11111111-1111-4111-8111-111111111111';
export const requestId = '22222222-2222-4222-8222-222222222222';
export const activeSession: LearningSessionView = {
  sessionId,
  contentVersion: 'hanbit-v1',
  mode: 'FIRST',
  dayNumber: 1,
  state: 'QUESTION_ACTIVE',
  answeredCount: 0,
  questionCount: 5,
  question: {
    questionId: 1,
    dayNumber: 1,
    position: 1,
    text: '테스트용 문항입니다.',
    timeLimitSeconds: 10,
    deadlineAt: '2026-10-13T00:00:10Z',
  },
  lastAnswer: null,
};
export const answerResult: AnswerResult = {
  attemptAnswerId: '33333333-3333-4333-8333-333333333333',
  questionId: 1,
  outcome: 'CORRECT',
  correctChoice: 'O',
  explanation: '테스트용 설명입니다.',
  xpAwarded: 100,
  totalXp: 100,
  level: 1,
  attemptCorrectCount: 1,
  attemptAnsweredCount: 1,
  attemptState: 'ACTIVE',
  dayState: 'IN_PROGRESS',
  nextDayAvailable: false,
  reviewPromptEligible: false,
};
export const answeredSession: LearningSessionView = {
  ...activeSession,
  state: 'AWAITING_ADVANCE',
  answeredCount: 1,
  lastAnswer: answerResult,
};
export const learningStatus: LearningStatus = {
  contentVersion: 'hanbit-v1',
  calendarCap: 1,
  earliestUnpassedDay: 1,
  passedDayCount: 0,
  firstAnswerCount: 0,
  totalXp: 0,
  level: 1,
  nextAction: 'CONTINUE_SESSION',
  activeSession,
};
export const personalQuestion: PersonalQuestionView = {
  questionId: 1,
  dayNumber: 1,
  position: 1,
  text: '테스트용 문항입니다.',
  inReviewQueue: true,
  mastered: false,
  bookmarked: false,
  lastOutcome: 'WRONG',
  lastAnsweredAt: '2026-10-12T00:00:01Z',
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
