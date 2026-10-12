import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server, teacher } from '../../test/server';
import { renderPage } from '../../test/render';
import { TeacherAccountsPage } from './TeacherAccountsPage';
const issued = {
  accountId: 'new-teacher',
  name: '김선생',
  staffLoginId: 'teacher.new',
  initialPassword: 'TestOnlyInitial!2026',
};
it('initialPasswordIsNotRestored', async () => {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ ...teacher, role: 'ADMIN' })),
    http.get('*/api/admin/teachers', () =>
      HttpResponse.json([
        {
          accountId: issued.accountId,
          name: issued.name,
          staffLoginId: issued.staffLoginId,
          mustChangePassword: true,
        },
      ]),
    ),
    http.post('*/api/admin/teachers', () => HttpResponse.json(issued, { status: 201 })),
  );
  const first = renderPage(<TeacherAccountsPage />);
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText('교사 이름'), '김선생');
  await u.type(screen.getByLabelText('교직원 아이디'), 'teacher.new');
  await u.click(screen.getByRole('button', { name: '교사 계정 발급' }));
  expect(await screen.findByLabelText('초기 비밀번호')).toHaveValue(issued.initialPassword);
  expect(localStorage.getItem('initialPassword')).toBeNull();
  expect(sessionStorage.getItem('initialPassword')).toBeNull();
  for (const q of first.client.getQueryCache().getAll())
    expect(JSON.stringify(q.state.data ?? null)).not.toContain(issued.initialPassword);
  first.unmount();
  renderPage(<TeacherAccountsPage />);
  await screen.findByText('교사 계정 목록');
  expect(screen.queryByLabelText('초기 비밀번호')).not.toBeInTheDocument();
});
it('failedIssuanceIsNotSuccess', async () => {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ ...teacher, role: 'ADMIN' })),
    http.get('*/api/admin/teachers', () => HttpResponse.json([])),
    http.post('*/api/admin/teachers', () =>
      HttpResponse.json(
        { code: 'STAFF_LOGIN_ID_IN_USE', message: '이미 사용 중인 아이디입니다.', fieldErrors: {} },
        { status: 409 },
      ),
    ),
  );
  renderPage(<TeacherAccountsPage />);
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText('교사 이름'), '김선생');
  await u.type(screen.getByLabelText('교직원 아이디'), 'teacher.new');
  await u.click(screen.getByRole('button', { name: '교사 계정 발급' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('이미 사용');
  expect(screen.queryByLabelText('초기 비밀번호')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: '교사 계정 발급' })).toBeEnabled());
});

