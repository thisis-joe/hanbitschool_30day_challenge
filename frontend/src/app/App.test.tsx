import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { App } from './App';
import { renderPage } from '../test/render';
import { server, student, teacher } from '../test/server';

it('studentLogoReturnsToAccountWithoutLoggingOut', async () => {
  let logoutRequests = 0;
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(student)),
    http.post('*/api/auth/logout', () => {
      logoutRequests++;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderPage(<App />, '/account/password');
  await screen.findByRole('heading', { name: '비밀번호 변경' });
  await userEvent.click(screen.getByRole('link', { name: /한빛학교.*배움터/ }));
  expect(await screen.findByRole('heading', { name: '숲친구' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: '학생 로그인' })).not.toBeInTheDocument();
  expect(logoutRequests).toBe(0);
});

it.each(['TEACHER', 'ADMIN'])('staffLogoReturnsToClassroomsFor%s', async (role) => {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ ...teacher, role })),
    http.get('*/api/staff/classrooms', () => HttpResponse.json([])),
  );
  renderPage(<App />, '/account/password');
  await screen.findByRole('heading', { name: '비밀번호 변경' });
  await userEvent.click(screen.getByRole('link', { name: /한빛학교.*배움터/ }));
  expect(await screen.findByRole('heading', { name: '우리 학교 학급' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: '학생 로그인' })).not.toBeInTheDocument();
});

it('logoKeepsIssuedTeacherOnRequiredPasswordChange', async () => {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ ...teacher, mustChangePassword: true })),
  );
  renderPage(<App />, '/account/password');
  await screen.findByRole('heading', { name: '비밀번호 변경' });
  await userEvent.click(screen.getByRole('link', { name: /한빛학교.*배움터/ }));
  expect(await screen.findByRole('heading', { name: '비밀번호 변경' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: '학생 로그인' })).not.toBeInTheDocument();
});

it('anonymousHomeOpensStudentLogin', async () => {
  renderPage(<App />);
  expect(await screen.findByRole('heading', { name: '학생 로그인' })).toBeVisible();
});

it('homeWaitsForSessionBeforeChoosingDestination', async () => {
  server.use(
    http.get('*/api/auth/me', async () => {
      await delay(100);
      return HttpResponse.json(student);
    }),
  );
  renderPage(<App />);
  expect(screen.queryByRole('heading', { name: '학생 로그인' })).not.toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: '숲친구' })).toBeVisible();
});

it('homeOffersRetryForSessionNetworkFailureInsteadOfLogin', async () => {
  server.use(http.get('*/api/auth/me', () => HttpResponse.error()));
  renderPage(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('연결');
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: '학생 로그인' })).not.toBeInTheDocument();
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(student)));
  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByRole('heading', { name: '숲친구' })).toBeVisible();
});
