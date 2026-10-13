import { beforeEach, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { renderPage } from '../../test/render';
import { server, student } from '../../test/server';
import {
  activeSession,
  deferred,
  learningStatus,
  personalQuestion,
  sessionId,
} from '../../test/learningFixtures';
import { PersonalQuestionsPage } from './PersonalQuestionsPage';

beforeEach(() =>
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(student)),
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json({ ...learningStatus, activeSession: null }),
    ),
  ),
);
function Location() {
  return <p>{useLocation().pathname + useLocation().search}</p>;
}
function renderQuestions(path = '/student/questions?filter=REVIEW_QUEUE') {
  return renderPage(
    <>
      <Location />
      <Routes>
        <Route path="/student/questions" element={<PersonalQuestionsPage />} />
        <Route path="/student/learning/sessions/:id" element={<p>복습 세션 화면</p>} />
      </Routes>
    </>,
    path,
  );
}

// Wrong filter URL/API mapping or stale selection across filters must be observable.
it('allThreeFiltersAreUrlBackedAndSurviveReload', async () => {
  server.use(
    http.get('*/api/student/learning/questions', ({ request }) =>
      HttpResponse.json([
        { ...personalQuestion, text: new URL(request.url).searchParams.get('filter')! },
      ]),
    ),
  );
  const rendered = renderQuestions('/student/questions?filter=MASTERED');
  expect(await screen.findByText('MASTERED')).toBeVisible();
  expect(screen.getByRole('link', { name: '복습 완료' })).toHaveAttribute('aria-current', 'page');
  await userEvent.click(screen.getByRole('link', { name: '별표한 문제' }));
  expect(await screen.findByText('BOOKMARKED')).toBeVisible();
  expect(screen.getByText('/student/questions?filter=BOOKMARKED')).toBeVisible();
  await userEvent.click(screen.getByRole('link', { name: '다시 볼 문제' }));
  expect(await screen.findByText('REVIEW_QUEUE')).toBeVisible();
  rendered.unmount();
  renderQuestions('/student/questions?filter=BOOKMARKED');
  expect(await screen.findByText('BOOKMARKED')).toBeVisible();
});
it('listShowsLoadingEmptyAndRetryableError', async () => {
  server.use(http.get('*/api/student/learning/questions', () => HttpResponse.error()));
  renderQuestions();
  expect(screen.getByRole('status')).toHaveTextContent('불러오고');
  expect(await screen.findByRole('alert')).toHaveTextContent('연결');
  server.use(http.get('*/api/student/learning/questions', () => HttpResponse.json([])));
  await userEvent.click(screen.getByRole('button', { name: '목록 다시 불러오기' }));
  expect(await screen.findByText('이 목록에 아직 문제가 없어요.')).toBeVisible();
});
it('reviewSelectionIncludesOnlyActiveQueuedQuestionsInVisibleOrder', async () => {
  let command: unknown;
  const rows = [
    { ...personalQuestion, questionId: 6, dayNumber: 2, position: 1, text: '둘째 회차' },
    {
      ...personalQuestion,
      questionId: 2,
      position: 2,
      inReviewQueue: false,
      bookmarked: true,
      text: '큐 밖 문제',
    },
    { ...personalQuestion, questionId: 1, text: '첫째 회차' },
  ];
  server.use(
    http.get('*/api/student/learning/questions', () => HttpResponse.json(rows)),
    http.post('*/api/student/learning/sessions', async ({ request }) => {
      command = await request.json();
      return HttpResponse.json({ ...activeSession, mode: 'REVIEW', dayNumber: null });
    }),
    http.get('*/api/student/learning/sessions/:id', () =>
      HttpResponse.json({ ...activeSession, mode: 'REVIEW', dayNumber: null }),
    ),
  );
  renderQuestions('/student/questions?filter=BOOKMARKED');
  const list = await screen.findByRole('list', { name: '개인 문제 목록' });
  const items = within(list).getAllByRole('listitem');
  expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual([
    '1회차 · 문항 1',
    '1회차 · 문항 2',
    '2회차 · 문항 1',
  ]);
  expect(within(items[1]).queryByRole('checkbox')).toBeNull();
  await userEvent.click(within(items[2]).getByRole('checkbox'));
  await userEvent.click(within(items[0]).getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: '선택한 문제 복습하기' }));
  expect(await screen.findByText('복습 세션 화면')).toBeVisible();
  expect(command).toMatchObject({
    mode: 'REVIEW',
    dayNumber: null,
    questionIds: [1, 6],
    requestId: expect.any(String),
  });
});
it('queueRemovalWaitsForConfirmationAndDoesNotClearOnCorrectResponse', async () => {
  const release = deferred<void>();
  let removed = false;
  let deletes = 0;
  server.use(
    http.get('*/api/student/learning/questions', () =>
      HttpResponse.json(
        removed ? [] : [{ ...personalQuestion, mastered: true, lastOutcome: 'CORRECT' }],
      ),
    ),
    http.delete('*/api/student/learning/review-queue/1', async () => {
      deletes++;
      await release.promise;
      removed = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderQuestions();
  expect(await screen.findByText(personalQuestion.text)).toBeVisible();
  expect(deletes).toBe(0);
  await userEvent.click(screen.getByRole('button', { name: '다시 볼 목록에서 제거' }));
  expect(screen.getByText(personalQuestion.text)).toBeVisible();
  expect(screen.getByRole('button', { name: '다시 볼 목록에서 제거' })).toBeDisabled();
  release.resolve();
  expect(await screen.findByText('이 목록에 아직 문제가 없어요.')).toBeVisible();
  expect(deletes).toBe(1);
});
it('reviewStartConflictRecoversActualActiveSession', async () => {
  let reads = 0;
  server.use(
    http.get('*/api/student/learning/questions', () => HttpResponse.json([personalQuestion])),
    http.get('*/api/student/learning/status', () =>
      HttpResponse.json(++reads < 3 ? { ...learningStatus, activeSession: null } : learningStatus),
    ),
    http.post('*/api/student/learning/sessions', () =>
      HttpResponse.json(
        { code: 'SESSION_CONFLICT', message: '진행 중인 학습이 있어요.', fieldErrors: {} },
        { status: 409 },
      ),
    ),
    http.get('*/api/student/learning/sessions/:id', () => HttpResponse.json(activeSession)),
  );
  renderQuestions();
  await userEvent.click(await screen.findByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: '선택한 문제 복습하기' }));
  expect(await screen.findByText('복습 세션 화면')).toBeVisible();
});
it('activeSessionBlocksPrivateReviewStart', async () => {
  server.use(
    http.get('*/api/student/learning/questions', () => HttpResponse.json([personalQuestion])),
    http.get('*/api/student/learning/status', () => HttpResponse.json(learningStatus)),
  );
  renderQuestions();
  await userEvent.click(await screen.findByRole('checkbox'));
  expect(await screen.findByRole('link', { name: '진행 중인 학습 이어풀기' })).toHaveAttribute(
    'href',
    `/student/learning/sessions/${sessionId}`,
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '선택한 문제 복습하기' })).toBeDisabled(),
  );
});

// Deriving recent outcome from mastery/queue/star would mislabel the mastered WRONG or null rows.
it.each([
  ['CORRECT', '최근 결과: 정답', true, false, '복습 완료'],
  ['WRONG', '최근 결과: 오답', true, true, '복습 완료 · 다시 볼 목록에 있어요'],
  ['TIMED_OUT', '최근 결과: 시간 초과', false, true, '복습 미완료 · 다시 볼 목록에 있어요'],
  [null, '최근 결과: 미답변', false, false, '복습 미완료'],
] as const)(
  'serverLastOutcomeRemainsIndependentFromPersonalStates: %s',
  async (lastOutcome, label, mastered, inReviewQueue, masteryLabel) => {
    const question = {
      ...personalQuestion,
      bookmarked: true,
      mastered,
      inReviewQueue,
      lastOutcome,
      lastAnsweredAt: lastOutcome === null ? null : personalQuestion.lastAnsweredAt,
    };
    server.use(
      http.get('*/api/student/learning/questions', ({ request }) => {
        const filter = new URL(request.url).searchParams.get('filter');
        return HttpResponse.json(
          filter === 'BOOKMARKED' ||
            (filter === 'MASTERED' && mastered) ||
            (filter === 'REVIEW_QUEUE' && inReviewQueue)
            ? [question]
            : [],
        );
      }),
    );
    renderQuestions('/student/questions?filter=BOOKMARKED');
    const row = within((await screen.findByText(question.text)).closest('li')!);
    expect(row.getByText(label)).toBeVisible();
    expect(row.getByText(masteryLabel)).toBeVisible();
    await waitFor(() =>
      expect(row.getByRole('button', { name: '별표' })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(row.queryByRole('button', { name: '다시 볼 목록에서 제거' }) !== null).toBe(
      inReviewQueue,
    );
  },
);
