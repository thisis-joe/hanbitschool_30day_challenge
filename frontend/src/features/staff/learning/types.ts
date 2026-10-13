import type { CharacterId } from '../../game/types';
import type { DayProgressState } from '../../learning/types';

export interface PageResult<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}
export interface Distinction {
  answered: number;
  correct: number;
  accuracy: number | null;
}
export type StudentStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETE';
export interface TeacherStudentRow {
  accountId: string;
  studentNumber: number;
  name: string;
  characterId: CharacterId | null;
  status: StudentStatus;
  answered: number;
  correct: number;
  wrong: number;
  timedOut: number;
  reviewedWrong: number;
  pendingWrong: number;
  passedDayCount: number;
  accuracy: number | null;
}
export interface TeacherLearningSummary {
  studentCount: number;
  participatingCount: number;
  completeCount: number;
  answered: number;
  correct: number;
  choiceWrong: number;
  timedOut: number;
  wrong: number;
  reviewedWrong: number;
  pendingWrong: number;
  unanswered: number;
  accuracy: number | null;
  facts: Distinction;
  interpretations: Distinction;
  hardQuestions: TeacherQuestionRow[];
}
export interface TeacherStudentsPage {
  summary: TeacherLearningSummary;
  students: PageResult<TeacherStudentRow>;
}
export type TeacherAnswerState = 'UNANSWERED' | 'CORRECT' | 'WRONG' | 'TIMED_OUT';
export type AnswerChoice = 'O' | 'X';
export interface TeacherQuestionRow {
  questionId: number;
  dayNumber: number;
  text: string;
  correctChoice: AnswerChoice;
  answered: number;
  correct: number;
  choiceWrong: number;
  timedOut: number;
  wrong: number;
  unanswered: number;
  wrongRate: number | null;
}
export interface TeacherRespondent {
  accountId: string;
  studentNumber: number;
  name: string;
  firstChoice: AnswerChoice | null;
  outcome: TeacherAnswerState;
}
export interface TeacherQuestionDetail {
  question: TeacherQuestionRow;
  explanation: string;
  correct: TeacherRespondent[];
  wrong: TeacherRespondent[];
  unanswered: number;
}
export interface TeacherAnswerRow {
  questionId: number;
  dayNumber: number;
  position: number;
  text: string;
  correctChoice: AnswerChoice;
  firstChoice: AnswerChoice | null;
  outcome: TeacherAnswerState;
  firstAnsweredAt: string | null;
  reviewedWrong: boolean;
}
export interface TeacherDayRow {
  dayNumber: number;
  state: DayProgressState;
  answered: number;
  correct: number;
  timedOut: number;
  passedAt: string | null;
}
export interface TeacherStudentDetail {
  student: TeacherStudentRow;
  days: TeacherDayRow[];
  answers: PageResult<TeacherAnswerRow>;
  previousStudentId: string | null;
  nextStudentId: string | null;
  ordinal: number;
  totalStudents: number;
  facts: Distinction;
  interpretations: Distinction;
}
export interface StudentListQuery {
  search: string;
  status: 'ALL' | StudentStatus;
  sort: 'NUMBER' | 'PROGRESS_ASC' | 'PENDING_WRONG_DESC';
  page: number;
  size: number;
}
export interface QuestionListQuery {
  day: number;
  search: string;
  sort: 'QUESTION_ASC' | 'WRONG_RATE_DESC' | 'TIMEOUT_DESC';
  page: number;
  size: number;
}
export interface AnswerListQuery {
  day: number;
  filter: 'WRONG' | 'TIMEOUT' | 'ALL' | 'UNANSWERED';
  page: number;
  size: number;
}
