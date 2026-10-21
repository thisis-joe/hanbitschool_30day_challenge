import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { AppRoutes } from '../../../app/router';
import { renderPage } from '../../../test/render';
import { server } from '../../../test/server';
import {
  deferred,
  studentDetail,
  teacherLearningHandlers,
} from '../../../test/teacherLearningFixtures';
vi.mock('../../game/avatarRenderer', () => ({ renderAvatar: async () => undefined }));
const path = '/staff/classrooms/class-a/learning';
it('keepsAnswerControlsAndFocusWhileAChangedFilterLoads', async () => {
  teacherLearningHandlers();
  const pending = deferred<typeof studentDetail>();
  let requested = false;
  server.use(
    http.get('*/api/staff/classrooms/:id/learning/students/:studentId', async ({ request }) => {
      if (new URL(request.url).searchParams.get('filter') === 'ALL') {
        requested = true;
        return HttpResponse.json(await pending.promise);
      }
      return HttpResponse.json(studentDetail);
    }),
  );
  renderPage(<AppRoutes />, path + '/students/student-a');
  const filter = await screen.findByLabelText('답변 필터');
  await userEvent.setup().selectOptions(filter, 'ALL');
  await waitFor(() => expect(requested).toBe(true));
  try {
    expect(screen.getByLabelText('답변 필터')).toBe(filter);
    expect(filter).toHaveFocus();
    expect(screen.getByRole('region', { name: '학생 요약' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('답변 목록을 갱신하고 있습니다');
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled();
  } finally {
    pending.resolve(studentDetail);
  }
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: '다음 페이지' })).toBeEnabled();
});
it('detailNavigationPreservesListUrlButUsesWholeClassOrder', async () => {
  teacherLearningHandlers();
  const u = userEvent.setup();
  renderPage(
    <AppRoutes />,
    path + '?search=학생&status=IN_PROGRESS&sort=PENDING_WRONG_DESC&page=2',
  );
  await u.click(await screen.findByRole('link', { name: /학생 상세/ }));
  expect(await screen.findByText(/학급 전체 번호순/)).toBeVisible();
  expect(document.activeElement === screen.queryAllByRole('heading', { level: 1 })[0]).toBe(true);
  expect(screen.getByRole('button', { name: '이전 학생' })).toBeDisabled();
  const back = screen.getByRole('link', { name: '목록으로 돌아가기' });
  expect(back).toHaveAttribute(
    'href',
    path + '?search=학생&status=IN_PROGRESS&sort=PENDING_WRONG_DESC&page=2',
  );
  back.focus();
  fireEvent.change(screen.getByLabelText('답변 필터'), { target: { value: 'TIMEOUT' } });
  await waitFor(() => expect(screen.queryByLabelText('답변 필터') !== null).toBe(true), {
    onTimeout: () => new Error('Student filter assertion did not settle'),
  });
  expect(document.activeElement === back).toBe(true);
  expect(screen.getByRole('link', { name: '목록으로 돌아가기' })).toHaveAttribute(
    'href',
    path + '?search=학생&status=IN_PROGRESS&sort=PENDING_WRONG_DESC&page=2',
  );
  await u.click(screen.getByRole('link', { name: '다음 학생' }));
  expect(await screen.findByRole('heading', { name: /학급 전체 다음 학생/ })).toBeVisible();
  expect(document.activeElement === screen.queryAllByRole('heading', { level: 1 })[0]).toBe(true);
  expect(screen.getByRole('button', { name: '다음 학생' })).toBeDisabled();
  expect(screen.getByRole('img', { name: /캐릭터 미선택/ })).toBeVisible();
  expect(screen.getByRole('link', { name: '목록으로 돌아가기' })).toHaveAttribute(
    'href',
    path + '?search=학생&status=IN_PROGRESS&sort=PENDING_WRONG_DESC&page=2',
  );
});
it('dayGridUsesCurrentServerStateAndAnswerFilterResetsPage', async () => {
  teacherLearningHandlers();
  let query: URLSearchParams | undefined;
  server.use(
    http.get('*/api/staff/classrooms/:id/learning/students/:studentId', ({ request }) => {
      query = new URL(request.url).searchParams;
      return HttpResponse.json(studentDetail);
    }),
  );
  renderPage(<AppRoutes />, path + '/students/student-a?page=1&filter=WRONG');
  const day = await screen.findByRole('button', { name: /1회차.*통과/ });
  expect(day).toHaveAccessibleDescription(/2026/);
  expect(screen.getByRole('button', { name: /2회차.*재도전 필요/ })).toBeVisible();
  expect(screen.getAllByRole('button', { name: /회차.*미시작/ })).toHaveLength(28);
  await userEvent.setup().click(day);
  await waitFor(() => expect(query?.get('day')).toBe('1'));
  expect(query?.get('page')).toBe('0');
  await userEvent.setup().selectOptions(screen.getByLabelText('답변 필터'), 'UNANSWERED');
  await waitFor(() => expect(query?.get('filter')).toBe('UNANSWERED'));
  expect(query?.get('page')).toBe('0');
  expect(screen.queryByRole('button', { name: /별표|꾸미기|복습 시작/ })).not.toBeInTheDocument();
});
