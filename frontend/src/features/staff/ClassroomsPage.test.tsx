import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server, teacher } from '../../test/server';
import { renderPage } from '../../test/render';
import { ClassroomsPage } from './ClassroomsPage';
import { AppRoutes } from '../../app/router';
const mine = {
  id: 'mine',
  gradeLabel: '1학년',
  classNumber: 1,
  startDate: '2026-10-12',
  studentCount: 1,
  canManage: true,
  joinCode: 'ABCDEFGH',
};
const other = {
  ...mine,
  id: 'other',
  classNumber: 2,
  canManage: false,
  joinCode: null,
  studentCount: 0,
};
function handlers() {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(teacher)),
    http.get('*/api/staff/classrooms', ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get('scope') === 'MINE' ? [mine] : [other],
      ),
    ),
    http.get('*/api/staff/classrooms/:id/students', ({ params }) =>
      HttpResponse.json(
        params.id === 'mine'
          ? [
              {
                accountId: 'student-a',
                gradeLabel: '1학년',
                classNumber: 1,
                studentNumber: 1,
                name: '김민수',
              },
            ]
          : [],
      ),
    ),
  );
}
it('scopeToggleAndSafeSchoolRoster', async () => {
  handlers();
  let url: URL | undefined;
  server.use(
    http.get('*/api/staff/classrooms', ({ request }) => {
      url = new URL(request.url);
      return HttpResponse.json(url.searchParams.get('scope') === 'MINE' ? [mine] : [other]);
    }),
  );
  const { client } = renderPage(<ClassroomsPage />);
  const u = userEvent.setup();
  expect(await screen.findByLabelText('1학년 1반 가입 코드')).toHaveValue('ABCDEFGH');
  expect(client.getQueryData(['staff', 'classrooms', 'teacher-a', 'MINE'])).toEqual([mine]);
  await u.click(screen.getByRole('button', { name: '명단 보기' }));
  expect(await screen.findByText('김민수')).toBeVisible();
  expect(screen.getByText('1번')).toBeVisible();
  await u.click(screen.getByRole('button', { name: '학교 전체' }));
  await waitFor(() => expect(url?.searchParams.get('scope')).toBe('SCHOOL'));
  await screen.findByText('1학년 2반');
  expect(screen.queryByLabelText(/가입 코드/)).not.toBeInTheDocument();
  expect(client.getQueryData(['staff', 'classrooms', 'teacher-a', 'SCHOOL'])).toEqual([other]);
  await u.click(screen.getByRole('button', { name: '명단 보기' }));
  expect(await screen.findByText('아직 가입한 학생이 없습니다.')).toBeVisible();
});
it('403RosterShowsError', async () => {
  handlers();
  server.use(
    http.get('*/api/staff/classrooms/:id/students', () =>
      HttpResponse.json(
        { code: 'FORBIDDEN', message: '접근 권한이 없습니다.', fieldErrors: {} },
        { status: 403 },
      ),
    ),
  );
  renderPage(<ClassroomsPage />);
  const u = userEvent.setup();
  await u.click(await screen.findByRole('button', { name: '명단 보기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('접근 권한');
});
it('actualAdminRouteRejectsTeacher', async () => {
  handlers();
  renderPage(<AppRoutes />, '/admin/teachers');
  expect(await screen.findByRole('alert')).toHaveTextContent('접근 권한');
  expect(screen.queryByRole('button', { name: '교사 계정 발급' })).not.toBeInTheDocument();
});
it('createClassSendsActualStartDateAndRefetches', async () => {
  handlers();
  let body: Record<string, unknown> = {};
  server.use(
    http.post('*/api/staff/classrooms', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(
        { ...mine, id: 'new', gradeLabel: '중1', classNumber: 3 },
        { status: 201 },
      );
    }),
  );
  renderPage(<ClassroomsPage />);
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText('학년 표시'), '중1');
  await u.type(screen.getByLabelText('반 번호'), '3');
  await u.type(screen.getByLabelText('시작일'), '2026-10-12');
  await u.click(screen.getByRole('button', { name: '학급 만들기' }));
  await waitFor(() =>
    expect(body).toEqual({ gradeLabel: '중1', classNumber: 3, startDate: '2026-10-12' }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent('학급을 만들었습니다.');
});
