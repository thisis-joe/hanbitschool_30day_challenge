import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Link } from 'react-router-dom';
import { AppRoutes } from '../../../app/router';
import { renderPage } from '../../../test/render';
import { server, student, teacher } from '../../../test/server';
import {
  deferred,
  overview,
  question,
  studentRow,
  teacherLearningHandlers,
} from '../../../test/teacherLearningFixtures';
import { replaceAccountCache } from '../../auth/queries';
import { clearAllPendingCommands } from '../../learning/pendingCommands';
vi.mock('../../game/avatarRenderer', () => ({ renderAvatar: async () => undefined }));
const path = '/staff/classrooms/class-a/learning';

it('keepsClassSummaryVisibleWhileStudentSearchLoads', async () => {
  teacherLearningHandlers();
  const pending = deferred<typeof overview>();
  let requested = false;
  server.use(
    http.get('*/api/staff/classrooms/:id/learning/students', async ({ request }) => {
      if (new URL(request.url).searchParams.get('search') === '검색') {
        requested = true;
        return HttpResponse.json(await pending.promise);
      }
      return HttpResponse.json(overview);
    }),
  );
  renderPage(<AppRoutes />, path);
  const summary = await screen.findByRole('region', { name: '학급 요약' });
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('이름·번호 검색'), '검색');
  await user.click(screen.getByRole('button', { name: '검색' }));
  await waitFor(() => expect(requested).toBe(true));
  try {
    expect(summary).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('목록을 갱신하고 있습니다');
  } finally {
    pending.resolve(overview);
  }
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
});

it('showsServerSummaryWithoutRecomputingFromCurrentPage', async () => {
  teacherLearningHandlers();
  renderPage(<AppRoutes />, path + '?search=학생');
  const region = await screen.findByRole('region', { name: '학급 요약' });
  expect(
    within(within(region).getByText('첫 정답률').parentElement!).getByText('25%', { exact: true }),
  ).toBeVisible();
  expect(screen.getByRole('heading', { name: /1학년 2반/ })).toBeVisible();
  expect(within(region).queryByRole('meter', { name: /해석\(X\) 정답률/ })).not.toBeInTheDocument();
  expect(await screen.findByRole('img', { name: '보라' })).toBeVisible();
  expect(
    within(screen.getByRole('rowheader')).getByRole('link', { name: /학생 상세/ }),
  ).toHaveAttribute('href', path + '/students/student-a');
});
it.each([
  { enrolled: 4, threshold: 3 },
  { enrolled: 2, threshold: 2 },
  { enrolled: 1, threshold: 1 },
])(
  'hardQuestionThresholdMatchesEnrolledCount ($enrolled students)',
  async ({ enrolled, threshold }) => {
    teacherLearningHandlers();
    server.use(
      http.get('*/api/staff/classrooms/:id/learning/students', () =>
        HttpResponse.json({
          ...overview,
          summary: { ...overview.summary, studentCount: enrolled },
        }),
      ),
    );
    renderPage(<AppRoutes />, path);
    const hard = await screen.findByRole('region', { name: '어려운 문항 TOP 3' });
    expect(within(hard).getByText(new RegExp(`최소 ${threshold}명`))).toBeVisible();
    expect(within(hard).getByRole('button', { name: /7번/ })).toBeVisible();
  },
);
it('questionFiltersUseServerQueryAndDistinguishUnansweredFromZeroWrongRate', async () => {
  teacherLearningHandlers();
  let query: URLSearchParams | undefined;
  server.use(
    http.get('*/api/staff/classrooms/:id/learning/questions', ({ request }) => {
      query = new URL(request.url).searchParams;
      return HttpResponse.json({
        items: [
          { ...question, correct: 3, wrong: 0, choiceWrong: 0, timedOut: 0, wrongRate: 0 },
          {
            ...question,
            questionId: 8,
            text: '미응답 문항',
            answered: 0,
            correct: 0,
            choiceWrong: 0,
            timedOut: 0,
            wrong: 0,
            unanswered: 4,
            wrongRate: null,
          },
        ],
        page: 3,
        size: 10,
        total: 32,
      });
    }),
  );
  renderPage(<AppRoutes />, path + '?tab=questions&day=2&sort=TIMEOUT_DESC&search=OX&page=3');
  const table = await screen.findByRole('table', { name: '문항 분석' });
  expect(Object.fromEntries(query!)).toEqual({
    day: '2',
    search: 'OX',
    sort: 'TIMEOUT_DESC',
    page: '3',
    size: '10',
  });
  expect(within(table).getByText('0%', { exact: true })).toBeVisible();
  expect(within(table).getByText('—', { exact: true })).toBeVisible();
  expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled();
  await userEvent.setup().selectOptions(screen.getByLabelText('문항 회차'), '1');
  await waitFor(() => expect(query?.get('page')).toBe('0'));
  expect(query?.get('day')).toBe('1');
});
it('filtersAndSortsUseServerQueryAndZeroRatesShowDash', async () => {
  teacherLearningHandlers();
  let query: URLSearchParams | undefined;
  server.use(
    http.get('*/api/staff/classrooms/:id/learning/students', ({ request }) => {
      query = new URL(request.url).searchParams;
      return HttpResponse.json({
        ...overview,
        students: {
          ...overview.students,
          items: [
            { ...studentRow, accuracy: null, characterId: null },
            { ...studentRow, accountId: 'zero', name: '정답률 영', accuracy: 0 },
          ],
        },
      });
    }),
  );
  renderPage(<AppRoutes />, path + '?status=NEW&sort=PROGRESS_ASC&page=2&search=1');
  await screen.findByRole('table', { name: '학생 학습 현황' });
  expect(Object.fromEntries(query!)).toEqual({
    search: '1',
    status: 'NEW',
    sort: 'PROGRESS_ASC',
    page: '2',
    size: '20',
  });
  const table = screen.getByRole('table', { name: '학생 학습 현황' });
  expect(within(table).getByText('—', { exact: true })).toBeVisible();
  expect(within(table).getByText('0%', { exact: true })).toBeVisible();
  expect(screen.getByRole('img', { name: /캐릭터 미선택/ })).toBeVisible();
  await userEvent.setup().selectOptions(screen.getByLabelText('학생 상태'), 'ALL');
  await waitFor(() => expect(query?.get('page')).toBe('0'));
});
it('lateOtherOwnerAndClassResponsesCannotRenderPrivateRows', async () => {
  teacherLearningHandlers();
  const held = deferred<typeof overview>();
  let first = true;
  server.use(
    http.get('*/api/staff/classrooms/:id/learning/students', async ({ params }) => {
      if (first) {
        first = false;
        return HttpResponse.json(await held.promise);
      }
      return HttpResponse.json({
        ...overview,
        students: {
          ...overview.students,
          items: [
            { ...studentRow, name: params.id === 'class-b' ? '새 학급 학생' : '새 교사 학생' },
          ],
        },
      });
    }),
  );
  const { client } = renderPage(
    <>
      <Link to="/staff/classrooms/class-b/learning">학급 전환</Link>
      <AppRoutes />
    </>,
    path,
  );
  await waitFor(() => expect(first).toBe(false));
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ ...teacher, accountId: 'teacher-b' })),
  );
  await act(async () => {
    clearAllPendingCommands();
    await client.cancelQueries();
    replaceAccountCache(client, { ...teacher, role: 'TEACHER', accountId: 'teacher-b' });
  });
  expect(await screen.findByText('새 교사 학생')).toBeVisible();
  await userEvent.setup().click(screen.getByRole('link', { name: '학급 전환' }));
  expect(await screen.findByText('새 학급 학생')).toBeVisible();
  await act(async () =>
    held.resolve({
      ...overview,
      students: { ...overview.students, items: [{ ...studentRow, name: '늦은 비공개 학생' }] },
    }),
  );
  expect(screen.queryByText('늦은 비공개 학생')).not.toBeInTheDocument();
  expect(screen.queryByText('새 교사 학생')).not.toBeInTheDocument();
});
it('heldClassResponseCannotRenderAfterClassNavigation', async () => {
  teacherLearningHandlers();
  const held = deferred<typeof overview>();
  let started = false;
  server.use(
    http.get('*/api/staff/classrooms/:id/learning/students', async ({ params }) => {
      if (params.id === 'class-a') {
        started = true;
        return HttpResponse.json(await held.promise);
      }
      return HttpResponse.json({
        ...overview,
        students: { ...overview.students, items: [{ ...studentRow, name: '다른 학급 현재 학생' }] },
      });
    }),
  );
  renderPage(
    <>
      <Link to="/staff/classrooms/class-b/learning">학급 전환</Link>
      <AppRoutes />
    </>,
    path,
  );
  await waitFor(() => expect(started).toBe(true));
  await userEvent.setup().click(screen.getByRole('link', { name: '학급 전환' }));
  expect(await screen.findByText('다른 학급 현재 학생')).toBeVisible();
  await act(async () =>
    held.resolve({
      ...overview,
      students: { ...overview.students, items: [{ ...studentRow, name: '이전 학급 비공개 학생' }] },
    }),
  );
  expect(screen.queryByText('이전 학급 비공개 학생')).not.toBeInTheDocument();
});
it('teacherNamesAndQuestionTextRenderAsTextNotHtml', async () => {
  teacherLearningHandlers();
  const view = renderPage(<AppRoutes />, path);
  expect(await screen.findByText(studentRow.name)).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: '문항 분석' }));
  expect(await screen.findByRole('table', { name: '문항 분석' })).toHaveTextContent(question.text);
  expect(view.container.querySelector('img, script')).toBeNull();
});
it('noPrivateStudentQueueControlsInTeacherView', async () => {
  teacherLearningHandlers();
  renderPage(<AppRoutes />, path);
  await screen.findByRole('region', { name: '학급 요약' });
  expect(screen.getAllByText(/미개선 오답/).length).toBeGreaterThan(0);
  expect(
    screen.queryByRole('button', { name: /별표|다시 볼|꾸미기|복습 시작/ }),
  ).not.toBeInTheDocument();
});
it('directRoutesRejectStudentAndPasswordRequiredStaffBeforeStatisticsFetch', async () => {
  teacherLearningHandlers();
  let requests = 0;
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(student)),
    http.get('*/api/staff/classrooms/:id/learning/students', () => {
      requests++;
      return HttpResponse.json(overview);
    }),
  );
  const view = renderPage(<AppRoutes />, path);
  expect(await screen.findByRole('alert')).toHaveTextContent('접근 권한');
  expect(requests).toBe(0);
  view.unmount();
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ ...teacher, mustChangePassword: true })),
  );
  renderPage(<AppRoutes />, path + '/students/student-a');
  expect(await screen.findByRole('heading', { name: /비밀번호 변경/ })).toBeVisible();
  expect(requests).toBe(0);
});
it('fetchErrorCanRetryAndEmptyClassHasExplicitEmptyStates', async () => {
  teacherLearningHandlers();
  let failed = true;
  server.use(
    http.get('*/api/staff/classrooms/:id/learning/students', () =>
      failed
        ? HttpResponse.json(
            { code: 'ERROR', message: '통계 조회 실패', fieldErrors: {} },
            { status: 500 },
          )
        : HttpResponse.json({
            ...overview,
            summary: { ...overview.summary, studentCount: 0, hardQuestions: [] },
            students: { items: [], page: 0, size: 20, total: 0 },
          }),
    ),
  );
  renderPage(<AppRoutes />, path);
  expect(await screen.findByRole('alert')).toHaveTextContent('통계 조회 실패');
  failed = false;
  await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('가입한 학생이 없습니다.')).toBeVisible();
});
