import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { AppRoutes } from '../../../app/router';
import { renderPage } from '../../../test/render';
import { server } from '../../../test/server';
import { studentDetail, teacherLearningHandlers } from '../../../test/teacherLearningFixtures';
vi.mock('../../game/avatarRenderer', () => ({ renderAvatar: async () => undefined }));
const path = '/staff/classrooms/class-a/learning';
it('detailNavigationPreservesListUrlButUsesWholeClassOrder', async () => {
  teacherLearningHandlers();
  const u = userEvent.setup();
  renderPage(
    <AppRoutes />,
    path + '?search=학생&status=IN_PROGRESS&sort=PENDING_WRONG_DESC&page=2',
  );
  await u.click(await screen.findByRole('link', { name: /학생 상세/ }));
  expect(await screen.findByText(/학급 전체 번호순/)).toBeVisible();
  expect(screen.getByRole('button', { name: '이전 학생' })).toBeDisabled();
  const back = screen.getByRole('link', { name: '목록으로 돌아가기' });
  expect(back).toHaveAttribute(
    'href',
    path + '?search=학생&status=IN_PROGRESS&sort=PENDING_WRONG_DESC&page=2',
  );
  await u.selectOptions(screen.getByLabelText('답변 필터'), 'TIMEOUT');
  expect(screen.getByRole('link', { name: '목록으로 돌아가기' })).toHaveAttribute(
    'href',
    path + '?search=학생&status=IN_PROGRESS&sort=PENDING_WRONG_DESC&page=2',
  );
  await u.click(screen.getByRole('link', { name: '다음 학생' }));
  expect(await screen.findByRole('heading', { name: /학급 전체 다음 학생/ })).toBeVisible();
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
