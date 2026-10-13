import { act, screen, waitFor as rtlWaitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { AppRoutes } from '../../../app/router';
import { renderPage } from '../../../test/render';
import { server, teacher } from '../../../test/server';
import { replaceAccountCache } from '../../auth/queries';
import { clearAllPendingCommands } from '../../learning/pendingCommands';
import {
  deferred,
  questionDetail,
  teacherLearningHandlers,
} from '../../../test/teacherLearningFixtures';
vi.mock('../../game/avatarRenderer', () => ({ renderAvatar: async () => undefined }));
const waitFor = (check: () => void) =>
  rtlWaitFor(check, { onTimeout: () => new Error('Question dialog assertion did not settle') });
it('questionDialogTrapsFocusEscapeAndRestoresTrigger', async () => {
  teacherLearningHandlers();
  const u = userEvent.setup();
  const view = renderPage(<AppRoutes />, '/staff/classrooms/class-a/learning');
  const trigger = await screen.findByRole('button', { name: /7번 문항 상세/ });
  await u.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: '7번 문항 상세' });
  expect(await within(dialog).findByText(questionDetail.explanation)).toBeVisible();
  expect(within(dialog).getByText(/3번 시간초과 학생/)).toBeVisible();
  expect(within(dialog).getByText(/미응답 1명/)).toBeVisible();
  expect(view.container.querySelector('img, script')).toBeNull();
  expect(dialog.querySelector('img, script')).toBeNull();
  const close = within(dialog).getByRole('button', { name: '닫기' });
  expect(close).toHaveFocus();
  const links = within(dialog).queryAllByRole('link');
  expect(links.length).toBe(3);
  await u.tab();
  expect(document.activeElement === links[0]).toBe(true);
  await u.tab({ shift: true });
  expect(close).toHaveFocus();
  await u.tab({ shift: true });
  expect(document.activeElement === links[2]).toBe(true);
  await u.tab();
  expect(close).toHaveFocus();
  await u.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
it.each(['student-a', 'student-b', 'student-c'])(
  'respondent %s opens class detail and releases modal with list context',
  async (id) => {
    teacherLearningHandlers();
    const u = userEvent.setup();
    const path = '/staff/classrooms/class-a/learning';
    const origin = path + '?tab=questions&sort=TIMEOUT_DESC&page=2';
    const view = renderPage(<AppRoutes />, origin + '&question=7');
    await waitFor(() => expect(document.querySelectorAll('.stats-respondents a').length).toBe(3));
    const link = document.querySelector<HTMLAnchorElement>(
      `.stats-respondents a[href="${path}/students/${id}"]`,
    );
    expect(link !== null).toBe(true);
    await u.click(link!);
    await waitFor(() => expect(screen.queryByRole('dialog') === null).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: '목록으로 돌아가기' })?.getAttribute('href') === origin,
      ).toBe(true),
    );
    expect(view.container.inert).toBeFalsy();
    expect(view.container.hasAttribute('aria-hidden')).toBe(false);
    expect(document.body.style.overflow === 'hidden').toBe(false);
    await waitFor(() =>
      expect(document.activeElement === screen.queryByRole('heading', { level: 1 })).toBe(true),
    );
  },
);
it('respondent navigation from student detail retains its roster origin', async () => {
  teacherLearningHandlers();
  const u = userEvent.setup();
  const origin = '/staff/classrooms/class-a/learning?search=student&status=IN_PROGRESS&page=2';
  renderPage(<AppRoutes />, origin);
  await waitFor(() => expect(screen.queryAllByRole('link', { name: /학생 상세/ }).length).toBe(1));
  await u.click(screen.queryAllByRole('link', { name: /학생 상세/ })[0]);
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '7번 문항 상세' }) !== null).toBe(true),
  );
  await u.click(screen.queryAllByRole('button', { name: '7번 문항 상세' })[0]);
  await waitFor(() => expect(document.querySelectorAll('.stats-respondents a').length).toBe(3));
  await u.click(document.querySelectorAll<HTMLAnchorElement>('.stats-respondents a')[1]);
  await waitFor(() => expect(screen.queryByRole('dialog') === null).toBe(true));
  expect(
    screen.queryAllByRole('link', { name: '목록으로 돌아가기' })[0]?.getAttribute('href') ===
      origin,
  ).toBe(true);
});
it('closedDialogDoesNotFetchAndLateClosedResponseDoesNotReopen', async () => {
  teacherLearningHandlers();
  const held = deferred<typeof questionDetail>();
  let calls = 0;
  server.use(
    http.get('*/api/staff/classrooms/:id/learning/questions/:questionId', async () => {
      calls++;
      return HttpResponse.json(await held.promise);
    }),
  );
  renderPage(<AppRoutes />, '/staff/classrooms/class-a/learning');
  const trigger = await screen.findByRole('button', { name: /7번 문항 상세/ });
  expect(calls).toBe(0);
  const u = userEvent.setup();
  await u.click(trigger);
  await screen.findByRole('dialog');
  await u.keyboard('{Escape}');
  await act(async () => held.resolve(questionDetail));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
it('lateOldOwnerQuestionCannotReplaceCurrentOwnerRespondents', async () => {
  teacherLearningHandlers();
  const held = deferred<typeof questionDetail>();
  let calls = 0;
  server.use(
    http.get('*/api/staff/classrooms/:id/learning/questions/:questionId', async () => {
      calls++;
      return HttpResponse.json(
        calls === 1
          ? await held.promise
          : {
              ...questionDetail,
              explanation: '현재 교사 문항 해설',
              wrong: [{ ...questionDetail.wrong[0], name: '현재 교사 학생' }],
            },
      );
    }),
  );
  const { client } = renderPage(<AppRoutes />, '/staff/classrooms/class-a/learning?question=7');
  await waitFor(() => expect(calls).toBe(1));
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ ...teacher, accountId: 'teacher-b' })),
  );
  await act(async () => {
    clearAllPendingCommands();
    await client.cancelQueries();
    replaceAccountCache(client, { ...teacher, role: 'TEACHER', accountId: 'teacher-b' });
  });
  expect(await screen.findByText('현재 교사 문항 해설')).toBeVisible();
  await act(async () => held.resolve({ ...questionDetail, explanation: '이전 교사 비공개 해설' }));
  expect(screen.queryByText('이전 교사 비공개 해설')).not.toBeInTheDocument();
  expect(screen.queryByText(/시간초과 학생/)).not.toBeInTheDocument();
});
