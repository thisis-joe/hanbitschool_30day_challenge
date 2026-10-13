import { expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { overview, questionDetail, studentDetail } from '../../../test/teacherLearningFixtures';
import {
  getTeacherStudents,
  getTeacherStudent,
  getTeacherQuestions,
  getTeacherQuestion,
} from './api';
it('usesExactClassScopedPathsQueriesAndServerFields', async () => {
  const paths: string[] = [];
  server.use(
    http.get('*/api/staff/classrooms/:id/learning/*', ({ request }) => {
      const url = new URL(request.url);
      paths.push(url.pathname + url.search);
      return HttpResponse.json(
        url.pathname.endsWith('/questions/7')
          ? questionDetail
          : url.pathname.endsWith('/questions')
            ? { items: [], page: 0, size: 10, total: 0 }
            : url.pathname.endsWith('/students/student-a')
              ? studentDetail
              : overview,
      );
    }),
  );
  expect(
    (
      await getTeacherStudents('class a', {
        search: '가',
        status: 'NEW',
        sort: 'PROGRESS_ASC',
        page: 2,
        size: 20,
      })
    ).summary.accuracy,
  ).toBe(0.25);
  expect(
    (
      await getTeacherStudent('class a', 'student-a', {
        day: 2,
        filter: 'TIMEOUT',
        page: 0,
        size: 8,
      })
    ).nextStudentId,
  ).toBe('student-outside-page');
  await getTeacherQuestions('class a', {
    day: 1,
    search: 'OX',
    sort: 'TIMEOUT_DESC',
    page: 0,
    size: 10,
  });
  expect((await getTeacherQuestion('class a', 7)).wrong[1].outcome).toBe('TIMED_OUT');
  expect(paths).toEqual([
    '/api/staff/classrooms/class%20a/learning/students?search=%EA%B0%80&status=NEW&sort=PROGRESS_ASC&page=2&size=20',
    '/api/staff/classrooms/class%20a/learning/students/student-a?day=2&filter=TIMEOUT&page=0&size=8',
    '/api/staff/classrooms/class%20a/learning/questions?day=1&search=OX&sort=TIMEOUT_DESC&page=0&size=10',
    '/api/staff/classrooms/class%20a/learning/questions/7',
  ]);
});
it('abortedStatisticsRequestRejectsInsteadOfReturningRows', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    getTeacherStudents(
      'class-a',
      { search: '', status: 'ALL', sort: 'NUMBER', page: 0, size: 20 },
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
