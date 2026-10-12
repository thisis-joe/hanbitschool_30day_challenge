import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { http, HttpResponse, delay } from 'msw';
import { server, teacher } from '../test/server';
import { renderPage } from '../test/render';
import { RequireRole } from './RequireRole';
import { sessionId } from '../test/learningFixtures';
function routes() {
  return (
    <Routes>
      <Route
        path="/admin/teachers"
        element={
          <RequireRole allowed={['ADMIN']}>
            <p>교사 계정 발급</p>
          </RequireRole>
        }
      />
      <Route path="/staff/login" element={<p>직원 로그인 화면</p>} />
      <Route path="/account/password" element={<p>변경 화면</p>} />
    </Routes>
  );
}
it('unknownSessionDoesNotFlashStaffContent', async () => {
  server.use(
    http.get('*/api/auth/me', async () => {
      await delay(30);
      return HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
    }),
  );
  renderPage(routes(), '/admin/teachers');
  expect(screen.queryByText('교사 계정 발급')).not.toBeInTheDocument();
  expect(await screen.findByText('직원 로그인 화면')).toBeVisible();
});
it('teacherCannotOpenAdminScreen', async () => {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(teacher)));
  renderPage(routes(), '/admin/teachers');
  expect(await screen.findByRole('alert')).toHaveTextContent('접근 권한');
  expect(screen.queryByText('교사 계정 발급')).not.toBeInTheDocument();
});
it('forcedPasswordRedirectsBeforeContent', async () => {
  server.use(
    http.get('*/api/auth/me', () =>
      HttpResponse.json({ ...teacher, role: 'ADMIN', mustChangePassword: true }),
    ),
  );
  renderPage(routes(), '/admin/teachers');
  expect(await screen.findByText('변경 화면')).toBeVisible();
  expect(screen.queryByText('교사 계정 발급')).not.toBeInTheDocument();
});
it('networkFailureShowsRetryAndNoContent', async () => {
  server.use(http.get('*/api/auth/me', () => HttpResponse.error()));
  renderPage(routes(), '/admin/teachers');
  expect(await screen.findByRole('alert')).toHaveTextContent('연결');
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible();
  expect(screen.queryByText('교사 계정 발급')).not.toBeInTheDocument();
});
it('unknownRoleNeverRendersProtectedContent', async () => {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ ...teacher, role: 'SUPERADMIN' })),
  );
  renderPage(routes(), '/admin/teachers');
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByText('교사 계정 발급')).not.toBeInTheDocument();
});

it('expiredStudentDeepLinkKeepsValidatedResultReturnTo', async () => {
  function LoginLocation() {
    return <p>{useLocation().search}</p>;
  }
  const path = `/student/learning/sessions/${sessionId}/result`;
  renderPage(
    <Routes>
      <Route element={<RequireRole allowed={['STUDENT']} />}>
        <Route path={path} element={<p>개인 결과</p>} />
      </Route>
      <Route path="/login" element={<LoginLocation />} />
    </Routes>,
    path,
  );
  expect(await screen.findByText(`?returnTo=${encodeURIComponent(path)}`)).toBeVisible();
  expect(screen.queryByText('개인 결과')).toBeNull();
});
