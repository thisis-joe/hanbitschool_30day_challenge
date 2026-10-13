import { expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { App } from '../../app/App';
import { renderPage } from '../../test/render';
import { server, student } from '../../test/server';

// Replacing the header must not remove account recovery or logout access.
it('headerKeepsAccountAndLogoutAccess', async () => {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(student)));
  renderPage(<App />, '/account/password');
  await screen.findByRole('heading', { name: '비밀번호 변경' });
  const nav = within(screen.getByRole('navigation', { name: '학생 여행 메뉴' }));
  expect(nav.getByRole('link', { name: '오늘' })).toHaveAttribute('href', '/student/learning');
  expect(nav.getByRole('link', { name: '탐험' })).toHaveAttribute('href', '/student/map');
  expect(nav.getByRole('link', { name: '꾸미기' })).toHaveAttribute('href', '/student/closet');
  expect(nav.getByRole('link', { name: '나의 문제' })).toHaveAttribute(
    'href',
    '/student/questions?filter=REVIEW_QUEUE',
  );
  expect(screen.getByRole('link', { name: '내 정보' })).toHaveAttribute('href', '/student/account');
  expect(screen.getByRole('link', { name: '비밀번호 변경' })).toHaveAttribute(
    'href',
    '/account/password',
  );
  expect(screen.getByRole('button', { name: '로그아웃' })).toBeEnabled();
});
