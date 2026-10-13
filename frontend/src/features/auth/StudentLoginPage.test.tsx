import { it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server, student } from '../../test/server';
import { renderPage } from '../../test/render';
import { StudentLoginPage } from './StudentLoginPage';
import { Route, Routes, useLocation } from 'react-router-dom';
import { sessionId } from '../../test/learningFixtures';
async function fill() {
  const u = userEvent.setup();
  await screen.findByRole('option', { name: '한빛학교' });
  await u.selectOptions(screen.getByLabelText('학교'), 'school-a');
  await screen.findByRole('option', { name: '1학년' });
  await u.selectOptions(screen.getByLabelText('학년'), '1학년');
  await u.selectOptions(screen.getByLabelText('반'), '1');
  await u.type(screen.getByLabelText('번호'), '1');
  await u.type(screen.getByLabelText('비밀번호'), 'Hanbit!2026');
  return u;
}
it('loginDoesNotSendClassCodeOrName', async () => {
  let body: Record<string, unknown> = {};
  server.use(
    http.post('*/api/auth/students/login', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      expect(request.headers.get('X-CSRF-TOKEN')).toBe('test-token');
      return HttpResponse.json(student);
    }),
  );
  renderPage(<StudentLoginPage />);
  const u = await fill();
  await u.click(screen.getByRole('button', { name: '로그인' }));
  await waitFor(() => expect(body.studentNumber).toBe(1));
  expect(body).not.toHaveProperty('classCode');
  expect(body).not.toHaveProperty('name');
  expect(body).not.toHaveProperty('nickname');
});
it('401ShowsApprovedStudentError', async () => {
  server.use(
    http.post('*/api/auth/students/login', () =>
      HttpResponse.json(
        { code: 'INVALID_CREDENTIALS', message: 'invalid', fieldErrors: {} },
        { status: 401 },
      ),
    ),
  );
  renderPage(<StudentLoginPage />);
  const u = await fill();
  await u.click(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '학교·학년·반·번호 또는 비밀번호를 확인해 주세요.',
  );
});
it('403ShowsServerError', async () => {
  server.use(
    http.post('*/api/auth/students/login', () =>
      HttpResponse.json(
        { code: 'INVALID_CSRF_TOKEN', message: '다시 시도해 주세요.', fieldErrors: {} },
        { status: 403 },
      ),
    ),
  );
  renderPage(<StudentLoginPage />);
  const u = await fill();
  await u.click(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('다시 시도');
});

it.each([
  [null, '/student/learning'],
  [
    `/student/learning/sessions/${sessionId}/result`,
    `/student/learning/sessions/${sessionId}/result`,
  ],
  ['/student/questions?filter=BOOKMARKED', '/student/questions?filter=BOOKMARKED'],
  ['https://example.com/', '/student/learning'],
  ['//example.com/', '/student/learning'],
  ['/staff/classrooms', '/student/learning'],
  ['/student/learning/../../staff/classrooms', '/student/learning'],
])('studentLoginLandsOnSafeInternalReturnTo%s', async (returnTo, expected) => {
  function Landing() {
    const location = useLocation();
    return <p>{location.pathname + location.search}</p>;
  }
  server.use(http.post('*/api/auth/students/login', () => HttpResponse.json(student)));
  renderPage(
    <Routes>
      <Route path="/login" element={<StudentLoginPage />} />
      <Route path="/student/*" element={<Landing />} />
    </Routes>,
    returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login',
  );
  const u = await fill();
  await u.click(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByText(expected)).toBeVisible();
});
