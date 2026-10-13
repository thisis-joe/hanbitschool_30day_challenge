import { Routes, Route } from 'react-router-dom';
import { AccountPasswordPage } from './AccountPasswordPage';
import { refreshCsrf } from '../../lib/http';
import { it, expect, afterEach, vi } from 'vitest';
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server, student, teacher } from '../../test/server';
import { renderPage } from '../../test/render';
import { StaffLoginPage } from './StaffLoginPage';
import { StudentAccountPage } from './StudentAccountPage';
import {
  clearAllPendingCommands,
  readPendingCommand,
  writePendingCommand,
} from '../learning/pendingCommands';
import {
  deferred,
  learningStatus,
  personalQuestion,
  requestId,
  sessionId,
} from '../../test/learningFixtures';
import { App } from '../../app/App';
import { request } from '../../lib/http';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { meKey, useAcceptAccount, useCurrentAccount } from './queries';
import * as authApi from './api';
import * as learningApi from '../learning/api';
import { learningKeys } from '../learning/queries';
afterEach(() => {
  clearAllPendingCommands();
  sessionStorage.clear();
});
it('accountSwitchClearsCache', async () => {
  server.use(http.post('*/api/auth/staff/login', () => HttpResponse.json(teacher)));
  const { client } = renderPage(<StaffLoginPage />);
  writePendingCommand('student-a', { kind: 'ADVANCE', sessionId, command: { requestId } });
  client.setQueryData(['staff', 'classrooms'], [{ id: 'old' }]);
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('교직원 아이디'), 'teacher.a');
  await u.type(screen.getByLabelText('비밀번호'), 'Hanbit!2026');
  await u.click(screen.getByRole('button', { name: '로그인' }));
  await screen.findByText('로그인되었습니다.');
  expect(client.getQueryData(['staff', 'classrooms'])).toBeUndefined();
  expect(client.getQueryData(['auth', 'me'])).toMatchObject({ accountId: 'teacher-a' });
  expect(readPendingCommand('student-a')).toBeNull();
});

it('unauthorizedCleanupClearsEveryStudentsPendingLearningCommand', async () => {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(student)),
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json(
        { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.', fieldErrors: {} },
        { status: 401 },
      ),
    ),
  );
  writePendingCommand('student-a', { kind: 'ADVANCE', sessionId, command: { requestId } });
  writePendingCommand('student-b', { kind: 'ADVANCE', sessionId, command: { requestId } });
  const { client } = renderPage(<App />, '/student/account');
  await screen.findByText('숲친구');
  await act(async () => {
    await expect(request('/api/student/learning/status')).rejects.toMatchObject({ status: 401 });
  });
  expect(client.getQueryData(['auth', 'me'])).toBeNull();
  expect(readPendingCommand('student-a')).toBeNull();
  expect(readPendingCommand('student-b')).toBeNull();
});

it('expiredCurrentAccountClearsPendingLearningCommands', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(meKey, student);
  writePendingCommand('student-a', { kind: 'ADVANCE', sessionId, command: { requestId } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useCurrentAccount(), { wrapper });
  await waitFor(() => expect(result.current.data).toBeNull());
  expect(readPendingCommand('student-a')).toBeNull();
});

// A canceled old /me fetch can still finish; its 401 must not clear the newly accepted student's command.
it('latePreviousAccount401DoesNotClearTheNewStudentsPendingCommand', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  const meRequests = vi.spyOn(authApi, 'getMe');
  const studentB = { ...student, accountId: 'student-b' };
  let reads = 0;
  server.use(
    http.get('*/api/auth/me', async () => {
      if (++reads > 1) return HttpResponse.json(studentB);
      entered.resolve();
      await release.promise;
      return HttpResponse.json(
        { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.', fieldErrors: {} },
        { status: 401 },
      );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(meKey, student);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => ({ account: useCurrentAccount(), accept: useAcceptAccount() }),
    { wrapper },
  );
  await entered.promise;
  const oldRequest = meRequests.mock.results[0].value;
  await act(async () => {
    await result.current.accept({ ...studentB, role: 'STUDENT' });
  });
  writePendingCommand('student-b', { kind: 'ADVANCE', sessionId, command: { requestId } });
  await act(async () => {
    release.resolve();
    // The spy forwards the actual MSW request; await its rejection after the hook's own handler.
    await expect(oldRequest).rejects.toMatchObject({ name: 'AbortError' });
  });
  expect(readPendingCommand('student-b')).toEqual({
    kind: 'ADVANCE',
    sessionId,
    command: { requestId },
  });
  expect(client.getQueryData(meKey)).toMatchObject({ accountId: 'student-b' });
});

it('logoutClearsPendingLearningCommands', async () => {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(student)),
    http.post('*/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
  );
  const { client } = renderPage(<App />, '/student/account');
  await screen.findByText('숲친구');
  writePendingCommand('student-a', { kind: 'ADVANCE', sessionId, command: { requestId } });
  await userEvent.setup().click(
    within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole('button', {
      name: '로그아웃',
    }),
  );
  await waitFor(() => expect(client.getQueryData(meKey)).toBeNull());
  expect(readPendingCommand('student-a')).toBeNull();
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

it('studentPasswordChangeLandsOnLearningHome', async () => {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(student)),
    http.post('*/api/auth/password', () => HttpResponse.json(student)),
    http.get('*/api/student/learning/status', () => HttpResponse.json(learningStatus)),
  );
  renderPage(<App />, '/account/password');
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText('현재 비밀번호'), 'Hanbit!2026');
  await u.type(screen.getByLabelText('새 비밀번호'), 'NextPass!2026');
  await u.type(screen.getByLabelText('새 비밀번호 확인'), 'NextPass!2026');
  await u.click(screen.getByRole('button', { name: '비밀번호 변경' }));
  expect(await screen.findByRole('heading', { name: '나의 학습' })).toBeVisible();
});

// Removing student key/reset/cancellation would render A's delayed list or pending retry for B.
it('switchingStudentsDoesNotRenderPreviousLearningData', async () => {
  const personalReads = vi.spyOn(learningApi, 'getPersonalQuestions');
  const entered = deferred<void>();
  const release = deferred<void>();
  const oldCompleted = deferred<void>();
  const studentB = {
    ...student,
    role: 'STUDENT' as const,
    accountId: 'student-b',
    nickname: '새친구',
  };
  let current = student;
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(current)),
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({
        ...learningStatus,
        activeSession: null,
        totalXp: current.accountId === 'student-a' ? 777 : 0,
      }),
    ),
    http.get('*/api/student/learning/questions', async () => {
      if (current.accountId === 'student-a') {
        entered.resolve();
        await release.promise;
        oldCompleted.resolve();
        return HttpResponse.json([{ ...personalQuestion, text: '이전 학생 개인 문항' }]);
      }
      return HttpResponse.json([{ ...personalQuestion, text: '새 학생 개인 문항' }]);
    }),
  );
  function Switch() {
    const accept = useAcceptAccount();
    return (
      <button
        onClick={() => {
          current = studentB;
          void accept(studentB);
        }}
      >
        학생 바꾸기
      </button>
    );
  }
  const { client } = renderPage(
    <>
      <Switch />
      <App />
    </>,
    '/student/questions?filter=REVIEW_QUEUE',
  );
  client.setQueryData(meKey, student);
  client.setQueryData(learningKeys.questions('student-a', 'REVIEW_QUEUE'), [
    { ...personalQuestion, text: '이전 학생 개인 문항' },
  ]);
  writePendingCommand('student-a', { kind: 'ADVANCE', sessionId, command: { requestId } });
  await entered.promise;
  expect(await screen.findByText('이전 학생 개인 문항')).toBeVisible();
  const oldRequests = personalReads.mock.results.map((result) => result.value as Promise<unknown>);
  await userEvent.click(screen.getByRole('button', { name: '학생 바꾸기' }));
  await waitFor(() => expect(client.getQueryData(meKey)).toMatchObject({ accountId: 'student-b' }));
  expect(await screen.findByText('새 학생 개인 문항')).toBeVisible();
  expect(screen.queryByText('이전 학생 개인 문항')).toBeNull();
  expect(screen.queryByRole('button', { name: '같은 요청 다시 확인' })).toBeNull();
  release.resolve();
  await oldCompleted.promise;
  // Await the real old HTTP promises too, including cancellation rejection, before checking late effects.
  await Promise.allSettled(oldRequests);
  await waitFor(() =>
    expect(
      client.getQueryData(learningKeys.questions('student-a', 'REVIEW_QUEUE')),
    ).toBeUndefined(),
  );
  expect(readPendingCommand('student-a')).toBeNull();
  expect(screen.queryByText('이전 학생 개인 문항')).toBeNull();
  await userEvent.click(screen.getByRole('link', { name: '오늘' }));
  expect(await screen.findByText('0 XP')).toBeVisible();
  expect(screen.queryByText('777 XP')).toBeNull();
});
