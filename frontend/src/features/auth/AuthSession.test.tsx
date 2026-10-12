import { Routes, Route } from 'react-router-dom';
import { AccountPasswordPage } from './AccountPasswordPage';
import { refreshCsrf } from '../../lib/http';
import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server, student, teacher } from '../../test/server';
import { renderPage } from '../../test/render';
import { StaffLoginPage } from './StaffLoginPage';
import { StudentAccountPage } from './StudentAccountPage';
it('accountSwitchClearsCache', async () => {
  server.use(http.post('*/api/auth/staff/login', () => HttpResponse.json(teacher)));
  const { client } = renderPage(<StaffLoginPage />);
  client.setQueryData(['staff', 'classrooms'], [{ id: 'old' }]);
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('교직원 아이디'), 'teacher.a');
  await u.type(screen.getByLabelText('비밀번호'), 'Hanbit!2026');
  await u.click(screen.getByRole('button', { name: '로그인' }));
  await screen.findByText('로그인되었습니다.');
  expect(client.getQueryData(['staff', 'classrooms'])).toBeUndefined();
  expect(client.getQueryData(['auth', 'me'])).toMatchObject({ accountId: 'teacher-a' });
});
it('rendersHtmlLookingNicknameAsText', async () => {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ ...student, nickname: '<img src=x>' })),
  );
  const result = renderPage(<StudentAccountPage />);
  expect(await screen.findByText('<img src=x>')).toBeVisible();
  expect(result.container.querySelector('img')).toBeNull();
});

it('csrfRefreshFailureDoesNotUndoSuccessfulLogin', async () => {
  await refreshCsrf();
  server.use(
    http.post('*/api/auth/staff/login', () => HttpResponse.json(teacher)),
    http.get('*/api/auth/csrf', () => HttpResponse.error()),
  );
  const { client } = renderPage(<StaffLoginPage />);
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('교직원 아이디'), 'teacher.a');
  await u.type(screen.getByLabelText('비밀번호'), 'Hanbit!2026');
  await u.click(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByText('로그인되었습니다.')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(client.getQueryData(['auth', 'me'])).toMatchObject({ accountId: 'teacher-a' });
  await expect(refreshCsrf()).rejects.toBeDefined();
});
it('csrfRefreshFailureDoesNotUndoPasswordChange', async () => {
  await refreshCsrf();
  let changes = 0;
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ ...teacher, mustChangePassword: true })),
    http.post('*/api/auth/password', () => {
      changes++;
      return HttpResponse.json(teacher);
    }),
    http.get('*/api/auth/csrf', () => HttpResponse.error()),
  );
  renderPage(
    <Routes>
      <Route path="/account/password" element={<AccountPasswordPage />} />
      <Route path="/staff/classrooms" element={<p>변경 완료 화면</p>} />
    </Routes>,
    '/account/password',
  );
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText('현재 비밀번호'), 'Hanbit!2026');
  await u.type(screen.getByLabelText('새 비밀번호'), 'NextPass!2026');
  await u.type(screen.getByLabelText('새 비밀번호 확인'), 'NextPass!2026');
  await u.click(screen.getByRole('button', { name: '비밀번호 변경' }));
  expect(await screen.findByText('변경 완료 화면')).toBeVisible();
  expect(changes).toBe(1);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await expect(refreshCsrf()).rejects.toBeDefined();
});
