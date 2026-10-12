import { beforeEach, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderPage } from '../../test/render';
import { server, student } from '../../test/server';
import { answerResult, deferred, personalQuestion } from '../../test/learningFixtures';
import { QuestionFeedbackActions } from './QuestionFeedbackActions';
import { useState } from 'react';

beforeEach(() => server.use(http.get('*/api/auth/me', () => HttpResponse.json(student))));
it('starIsIndependentAndWaitsForServerConfirmation', async () => {
  let bookmarked = false;
  const release = deferred<void>();
  let puts = 0;
  let deletes = 0;
  server.use(
    http.get('*/api/student/learning/questions', () =>
      HttpResponse.json([{ ...personalQuestion, bookmarked }]),
    ),
    http.put('*/api/student/learning/bookmarks/1', async () => {
      puts++;
      await release.promise;
      bookmarked = true;
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete('*/api/student/learning/bookmarks/1', () => {
      deletes++;
      bookmarked = false;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderPage(<QuestionFeedbackActions questionId={1} result={null} />);
  const star = await screen.findByRole('button', { name: '별표' });
  await waitFor(() => expect(star).toBeEnabled());
  expect(star).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(star);
  expect(star).toHaveAttribute('aria-pressed', 'false');
  expect(star).toBeDisabled();
  release.resolve();
  await waitFor(() => expect(star).toHaveAttribute('aria-pressed', 'true'));
  await userEvent.click(star);
  await waitFor(() => expect(star).toHaveAttribute('aria-pressed', 'false'));
  expect(puts).toBe(1);
  expect(deletes).toBe(1);
  expect(screen.queryByText('다시 볼 문제로 추가할까요?')).toBeNull();
});
it('reviewPromptOnlyAddsAfterConsent', async () => {
  let queued = false;
  let adds = 0;
  let reads = 0;
  server.use(
    http.get('*/api/student/learning/questions', () => {
      reads++;
      return HttpResponse.json(queued ? [{ ...personalQuestion, inReviewQueue: true }] : []);
    }),
    http.put('*/api/student/learning/review-queue/1', () => {
      adds++;
      queued = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const eligible = { ...answerResult, outcome: 'WRONG' as const, reviewPromptEligible: true };
  const rendered = renderPage(<QuestionFeedbackActions questionId={1} result={eligible} />);
  expect(await screen.findByText('다시 볼 문제로 추가할까요?')).toBeVisible();
  await waitFor(() => expect(screen.getByRole('button', { name: '추가하기' })).toBeEnabled());
  expect(adds).toBe(0);
  await userEvent.click(screen.getByRole('button', { name: '지금은 괜찮아요' }));
  expect(screen.queryByText('다시 볼 문제로 추가할까요?')).toBeNull();
  expect(adds).toBe(0);
  rendered.unmount();
  renderPage(
    <QuestionFeedbackActions
      questionId={1}
      result={{ ...eligible, attemptAnswerId: '44444444-4444-4444-8444-444444444444' }}
    />,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: '추가하기' })).toBeEnabled());
  const before = reads;
  await userEvent.click(screen.getByRole('button', { name: '추가하기' }));
  await waitFor(() => expect(screen.queryByText('다시 볼 문제로 추가할까요?')).toBeNull());
  expect(adds).toBe(1);
  expect(reads).toBeGreaterThan(before);
});
it('ineligibleResultNeverOffersAutomaticQueueMutation', async () => {
  server.use(
    http.get('*/api/student/learning/questions', () => HttpResponse.json([personalQuestion])),
  );
  renderPage(<QuestionFeedbackActions questionId={1} result={answerResult} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '별표' })).toBeEnabled());
  expect(screen.queryByRole('button', { name: '추가하기' })).toBeNull();
  expect(screen.queryByText('다시 볼 문제로 추가할까요?')).toBeNull();
});
it('failedBookmarkKeepsConfirmedStateAndAllowsRetry', async () => {
  server.use(
    http.get('*/api/student/learning/questions', () => HttpResponse.json([])),
    http.put('*/api/student/learning/bookmarks/1', () => HttpResponse.error()),
  );
  renderPage(<QuestionFeedbackActions questionId={1} result={null} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '별표' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: '별표' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('연결');
  expect(screen.getByRole('button', { name: '별표' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: '별표' })).toBeEnabled();
});

it('newFeedbackOffersConsentWhileSameFeedbackKeepsDismissal', async () => {
  server.use(http.get('*/api/student/learning/questions', () => HttpResponse.json([])));
  function FeedbackSequence() {
    const [id, setId] = useState(answerResult.attemptAnswerId);
    return (
      <>
        <button onClick={() => setId('44444444-4444-4444-8444-444444444444')}>새 피드백</button>
        <QuestionFeedbackActions
          questionId={1}
          result={{ ...answerResult, attemptAnswerId: id, reviewPromptEligible: true }}
        />
      </>
    );
  }
  renderPage(<FeedbackSequence />);
  expect(await screen.findByText('다시 볼 문제로 추가할까요?')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '지금은 괜찮아요' }));
  expect(screen.queryByText('다시 볼 문제로 추가할까요?')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: '새 피드백' }));
  expect(await screen.findByText('다시 볼 문제로 추가할까요?')).toBeVisible();
});
