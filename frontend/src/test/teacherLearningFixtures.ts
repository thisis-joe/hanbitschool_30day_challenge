import { http, HttpResponse } from 'msw';
import { server, teacher } from './server';
import type {
  TeacherLearningSummary,
  TeacherQuestionDetail,
  TeacherQuestionRow,
  TeacherStudentDetail,
  TeacherStudentRow,
  TeacherStudentsPage,
} from '../features/staff/learning/types';

export const classroom = {
  id: 'class-a',
  gradeLabel: '1학년',
  classNumber: 2,
  startDate: '2026-10-12',
  studentCount: 4,
  canManage: false,
  joinCode: null,
};
export const distinction = { answered: 4, correct: 1, accuracy: 0.25 };
export const question: TeacherQuestionRow = {
  questionId: 7,
  dayNumber: 2,
  text: '<img src=x onerror=alert(1)> 사실 문항',
  correctChoice: 'O',
  answered: 3,
  correct: 1,
  choiceWrong: 1,
  timedOut: 1,
  wrong: 2,
  unanswered: 1,
  wrongRate: 2 / 3,
};
export const studentRow: TeacherStudentRow = {
  accountId: 'student-a',
  studentNumber: 1,
  name: '<img src=x onerror=alert(1)> 학생',
  characterId: 'bora' as const,
  status: 'IN_PROGRESS',
  answered: 1,
  correct: 1,
  wrong: 0,
  timedOut: 0,
  reviewedWrong: 0,
  pendingWrong: 0,
  passedDayCount: 0,
  accuracy: 1,
};
export const summary: TeacherLearningSummary = {
  studentCount: 4,
  participatingCount: 3,
  completeCount: 0,
  answered: 4,
  correct: 1,
  choiceWrong: 2,
  timedOut: 1,
  wrong: 3,
  reviewedWrong: 1,
  pendingWrong: 2,
  unanswered: 596,
  accuracy: 0.25,
  facts: distinction,
  interpretations: { answered: 0, correct: 0, accuracy: null },
  hardQuestions: [question],
};
export const overview: TeacherStudentsPage = {
  summary,
  students: { items: [studentRow], page: 0, size: 20, total: 1 },
};
export const studentDetail: TeacherStudentDetail = {
  student: {
    ...studentRow,
    answered: 10,
    correct: 4,
    wrong: 6,
    reviewedWrong: 1,
    pendingWrong: 5,
    passedDayCount: 1,
    accuracy: 0.4,
  },
  days: Array.from({ length: 30 }, (_, i) => ({
    dayNumber: i + 1,
    state: i === 0 ? 'PASSED' : i === 1 ? 'RETRY_REQUIRED' : 'NOT_STARTED',
    answered: i < 2 ? 5 : 0,
    correct: i < 2 ? 2 : 0,
    timedOut: 0,
    passedAt: i === 0 ? '2026-10-12T01:00:00Z' : null,
  })),
  answers: {
    items: [
      {
        questionId: 7,
        dayNumber: 2,
        position: 2,
        text: question.text,
        correctChoice: 'O',
        firstChoice: 'X',
        outcome: 'WRONG',
        firstAnsweredAt: '2026-10-12T02:00:00Z',
        reviewedWrong: false,
      },
    ],
    page: 0,
    size: 8,
    total: 9,
  },
  previousStudentId: null,
  nextStudentId: 'student-outside-page',
  ordinal: 1,
  totalStudents: 4,
  facts: distinction,
  interpretations: { answered: 0, correct: 0, accuracy: null },
};
export const questionDetail: TeacherQuestionDetail = {
  question,
  explanation: '<script>alert(1)</script> 해설',
  correct: [
    {
      accountId: 'student-a',
      studentNumber: 1,
      name: studentRow.name,
      firstChoice: 'O',
      outcome: 'CORRECT',
    },
  ],
  wrong: [
    {
      accountId: 'student-b',
      studentNumber: 2,
      name: '오답 학생',
      firstChoice: 'X',
      outcome: 'WRONG',
    },
    {
      accountId: 'student-c',
      studentNumber: 3,
      name: '시간초과 학생',
      firstChoice: null,
      outcome: 'TIMED_OUT',
    },
  ],
  unanswered: 1,
};
export function teacherLearningHandlers() {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(teacher)),
    http.get('*/api/staff/classrooms', () =>
      HttpResponse.json([classroom, { ...classroom, id: 'class-b', classNumber: 3 }]),
    ),
    http.get('*/api/staff/classrooms/:id/learning/students', () => HttpResponse.json(overview)),
    http.get('*/api/staff/classrooms/:id/learning/students/:studentId', ({ params }) =>
      HttpResponse.json(
        params.studentId === 'student-outside-page'
          ? {
              ...studentDetail,
              student: {
                ...studentRow,
                accountId: 'student-outside-page',
                studentNumber: 3,
                name: '학급 전체 다음 학생',
                characterId: null,
              },
              previousStudentId: 'student-a',
              nextStudentId: null,
              ordinal: 4,
            }
          : studentDetail,
      ),
    ),
    http.get('*/api/staff/classrooms/:id/learning/questions', () =>
      HttpResponse.json({ items: [question], page: 0, size: 10, total: 1 }),
    ),
    http.get('*/api/staff/classrooms/:id/learning/questions/:questionId', () =>
      HttpResponse.json(questionDetail),
    ),
  );
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
