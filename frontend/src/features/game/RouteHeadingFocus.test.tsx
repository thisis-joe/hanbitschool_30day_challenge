import { act, screen, waitFor as rtlWaitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Link } from 'react-router-dom';
import { AppRoutes } from '../../app/router';
import { renderPage } from '../../test/render';
import { server, student } from '../../test/server';
import { gameView } from '../../test/gameFixtures';
import { learningStatus } from '../../test/learningFixtures';
import { deferred, teacherLearningHandlers } from '../../test/teacherLearningFixtures';
import { replaceAccountCache } from '../auth/queries';
import { gameKeys } from './queries';
vi.mock('./avatarRenderer', () => ({ renderAvatar: async () => undefined }));
const waitFor = (check: () => void) =>
  rtlWaitFor(check, { onTimeout: () => new Error('Route heading focus assertion did not settle') });

// Missing route-entry focus or refocusing on a refreshed snapshot breaks these contracts.
it.each([
  '/student/character',
  '/student/closet',
  '/student/learning',
  '/student/map',
  '/staff/classrooms/class-a/learning',
  '/staff/classrooms/class-a/learning/students/student-a',
])('focuses ready heading once on %s and preserves user focus during refresh', async (path) => {
  teacherLearningHandlers();
  if (path.startsWith('/student/'))
    server.use(http.get('*/api/auth/me', () => HttpResponse.json(student)));
  server.use(
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({ ...learningStatus, activeSession: null }),
    ),
  );
  const { client } = renderPage(
    <>
      <button>외부 포커스</button>
      <AppRoutes />
    </>,
    path,
  );
  await waitFor(() => expect(document.activeElement?.tagName === 'H1').toBe(true));
  const external = screen.queryAllByRole('button', { name: '외부 포커스' })[0];
  external.focus();
  await act(async () => {
    await client.refetchQueries();
  });
  expect(document.activeElement === external).toBe(true);
});
it('waits for ready owner and remembers an unready intervening owner before returning', async () => {
  const held = deferred<typeof gameView>();
  let ready = false;
  let owner = { ...student, role: 'STUDENT' as const };
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(owner)),
    http.get('*/api/student/game', async () =>
      HttpResponse.json(ready ? gameView : await held.promise),
    ),
  );
  const { client } = renderPage(
    <>
      <button>외부 포커스</button>
      <AppRoutes />
    </>,
    '/student/character',
  );
  const external = screen.queryAllByRole('button', { name: '외부 포커스' })[0];
  external.focus();
  await waitFor(() => expect(screen.queryAllByRole('heading', { level: 1 }).length).toBe(1));
  expect(document.activeElement === external).toBe(true);
  ready = true;
  await act(async () => held.resolve(gameView));
  await waitFor(() => expect(document.activeElement?.tagName === 'H1').toBe(true));
  external.focus();
  await act(async () => {
    client.setQueryData(gameKeys.view(student.accountId), { ...gameView, revision: 99 });
  });
  expect(document.activeElement === external).toBe(true);
  const other = deferred<typeof gameView>();
  let otherRead = false;
  server.use(
    http.get('*/api/student/game', async () => {
      if (owner.accountId === 'student-b') {
        otherRead = true;
        return HttpResponse.json(await other.promise);
      }
      return HttpResponse.json(gameView);
    }),
  );
  owner = { ...student, role: 'STUDENT', accountId: 'student-b' };
  await act(async () => replaceAccountCache(client, owner));
  await waitFor(() => expect(otherRead).toBe(true));
  expect(document.activeElement === external).toBe(true);
  owner = { ...student, role: 'STUDENT' };
  await act(async () => replaceAccountCache(client, owner));
  await waitFor(() => expect(document.activeElement?.tagName === 'H1').toBe(true));
  await act(async () => other.resolve(gameView));
});
it('focuses each pathname when the same dashboard switches between home and map', async () => {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(student)));
  server.use(http.get('*/api/student/learning/status', () => HttpResponse.json(learningStatus)));
  renderPage(
    <>
      <Link to="/student/map">경로 전환</Link>
      <AppRoutes />
    </>,
    '/student/learning',
  );
  await waitFor(() => expect(document.activeElement?.tagName === 'H1').toBe(true));
  await userEvent.setup().click(screen.queryAllByRole('link', { name: '경로 전환' })[0]);
  await waitFor(() =>
    expect(
      document.activeElement === screen.queryAllByRole('heading', { name: '탐험 지도' })[0],
    ).toBe(true),
  );
});
