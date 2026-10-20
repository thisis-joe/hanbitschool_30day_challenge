import { test, expect } from '@playwright/test';
import { signOut, studentLogin } from './helpers';
import {
  status,
  session,
  personal,
  provisionLearner,
  start,
  answer,
  advance,
  finishDay,
  resultPage,
  layoutAndTargets,
  visibleFocus,
} from './learning-helpers';
const root = '/api/student/learning';

// Catches missing fifth-answer persistence, completion POSTs, or client-derived XP/progress.
test('studentCanPassFiveQuestionsAndRestoreTheSavedResult', async ({ page }) => {
  const classroom = await provisionLearner(page);
  const before = await status(page);
  expect(before.nextAction).toBe('START_FIRST');
  expect(before.passedDayCount).toBe(0);
  expect(before.firstAnswerCount).toBe(0);
  expect(before.totalXp).toBe(0);
  await page.getByRole('button', { name: '회차별 학습 보기' }).click();
  await expect(page.getByRole('button', { name: '2회차 시작하기', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '3회차 시작하기', exact: true })).toBeDisabled();
  await layoutAndTargets(page);
  const first = await start(
    page,
    page.getByRole('button', { name: '오늘 학습 시작', exact: true }),
    'FIRST',
    1,
  );
  await expect(page.getByRole('heading', { name: '문항 1 / 5', exact: true })).toBeFocused();
  await layoutAndTargets(page);
  await page.keyboard.press('Tab');
  await visibleFocus(page.getByRole('button', { name: 'O · 사실', exact: true }));
  await expect(page.locator('time')).not.toHaveAttribute('aria-live', /.+/);
  const one = await answer(page, first, true, true);
  expect(one.xpAwarded).toBe(564); // Catch-up first correct: 375 + 190 - 1.
  await visibleFocus(page.getByRole('heading', { name: '정답이에요', exact: true }));
  await layoutAndTargets(page);
  const second = await advance(page, first.sessionId);
  const remaining = await finishDay(page, second, [true, true, true, true]);
  // The fifth response includes its first-pass award: 1314 + 1124.
  expect(remaining.map((result) => result.xpAwarded)).toEqual([564, 939, 564, 2438]);
  const final = remaining.at(-1)!;
  expect(final.attemptCorrectCount).toBe(5);
  expect(final.attemptState).toBe('PASSED');
  expect(final.dayState).toBe('PASSED');
  expect(final.totalXp).toBe(5069);
  expect(final.nextDayAvailable).toBe(true);
  const persisted = await session(page, first.sessionId);
  expect(persisted.state).toBe('COMPLETED');
  expect(persisted.lastAnswer?.attemptAnswerId).toBe(final.attemptAnswerId);
  const savedStatus = await status(page);
  expect(savedStatus.firstAnswerCount).toBe(5);
  expect(savedStatus.passedDayCount).toBe(1);
  expect(savedStatus.earliestUnpassedDay).toBe(2);
  expect(savedStatus.activeSession).toBeNull();
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith(root)) writes++;
  });
  // Reload without clicking completion: the result was already committed by answer five.
  await page.reload();
  await expect(page.getByRole('link', { name: '완료하기', exact: true })).toBeVisible();
  await resultPage(page, first.sessionId, '회차 통과');
  await visibleFocus(page.getByRole('heading', { name: '회차 통과', exact: true }));
  await layoutAndTargets(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: '회차 통과', exact: true })).toBeVisible();
  await signOut(page);
  await studentLogin(page, '한빛학교', classroom.gradeLabel, 1, 1, 'Student!2026');
  await page.goto(`/student/learning/sessions/${first.sessionId}/result`);
  await expect(page.getByRole('heading', { name: '회차 통과', exact: true })).toBeVisible();
  expect((await session(page, first.sessionId)).lastAnswer?.attemptAnswerId).toBe(
    final.attemptAnswerId,
  );
  expect((await status(page)).totalXp).toBe(5069);
  expect(writes).toBe(0);
  const next = await start(
    page,
    page.getByRole('button', { name: '다음 회차 시작', exact: true }),
    'FIRST',
    2,
  );
  expect(next.question?.dayNumber).toBe(2);
});

// Catches partial retries, first-fact rewrites, repeat XP inflation, or pass regression on later replay.
test('failedDayReplayPassKeepsFirstFactsAndPaysOneXpPerRepeat', async ({ page }) => {
  await provisionLearner(page);
  const first = await start(
    page,
    page.getByRole('button', { name: '오늘 학습 시작', exact: true }),
    'FIRST',
    1,
  );
  const failed = (await finishDay(page, first, [true, true, false, false, false])).at(-1)!;
  expect(failed.attemptCorrectCount).toBe(2);
  expect(failed.attemptState).toBe('RETRY_REQUIRED');
  expect(failed.dayState).toBe('RETRY_REQUIRED');
  expect(failed.totalXp).toBe(2250);
  await resultPage(page, first.sessionId, '다시 도전해요');
  const retry = await start(
    page,
    page.getByRole('button', { name: '다시 도전하기', exact: true }),
    'REPLAY',
    1,
  );
  expect(retry.questionCount).toBe(5);
  expect(retry.question?.position).toBe(1);
  const repeat = await finishDay(page, retry, [true, true, true, false, false]);
  // The fifth response includes repeat 1 XP plus first catch-up pass 1124 XP.
  expect(repeat.map((result) => result.xpAwarded)).toEqual([1, 1, 1, 1, 1125]);
  expect(repeat.at(-1)?.attemptCorrectCount).toBe(3);
  expect(repeat.at(-1)?.attemptState).toBe('PASSED');
  expect(repeat.at(-1)?.dayState).toBe('PASSED');
  expect(repeat.at(-1)?.totalXp).toBe(3379); // Five repeat XP + first catch-up pass 1124.
  expect((await status(page)).firstAnswerCount).toBe(5);
  expect((await session(page, first.sessionId)).lastAnswer?.attemptCorrectCount).toBe(2);
  expect((await session(page, first.sessionId)).lastAnswer?.attemptAnswerId).toBe(
    failed.attemptAnswerId,
  );
  await resultPage(page, retry.sessionId, '회차 통과');
  await page.getByRole('link', { name: '학습 홈으로', exact: true }).click();
  const replay = await start(
    page,
    page.getByRole('button', { name: '1회차 다시 풀기', exact: true }),
    'REPLAY',
    1,
  );
  const laterRepeats = await finishDay(page, replay, [false, false, false, false, false]);
  expect(laterRepeats.map((result) => result.xpAwarded)).toEqual([1, 1, 1, 1, 1]);
  const later = laterRepeats.at(-1)!;
  expect(later.attemptState).toBe('RETRY_REQUIRED');
  expect(later.dayState).toBe('PASSED');
  expect(later.totalXp).toBe(3384);
  await resultPage(page, replay.sessionId, '재학습 완료');
  await expect(
    page.getByText('이 회차의 통과 상태는 그대로 유지돼요.', { exact: true }),
  ).toBeVisible();
  expect((await status(page)).passedDayCount).toBe(1);
  expect((await status(page)).firstAnswerCount).toBe(5);
});

// Catches deadline regeneration on navigation, feedback reload, or an independently logged-in device.
test('questionAndFeedbackResumeKeepTheSameServerDeadline', async ({ page, browser }) => {
  const classroom = await provisionLearner(page);
  const first = await start(
    page,
    page.getByRole('button', { name: '오늘 학습 시작', exact: true }),
    'FIRST',
    1,
  );
  const deadline = first.question!.deadlineAt;
  await page.reload();
  await expect(page.getByRole('heading', { name: '문항 1 / 5', exact: true })).toBeVisible();
  expect((await session(page, first.sessionId)).question?.deadlineAt).toBe(deadline);
  const other = await browser.newContext();
  try {
    const secondDevice = await other.newPage();
    await studentLogin(secondDevice, '한빛학교', classroom.gradeLabel, 1, 1, 'Student!2026');
    await secondDevice.getByRole('link', { name: '이어풀기', exact: true }).click();
    const restored = await session(secondDevice, first.sessionId);
    expect(restored.question?.deadlineAt).toBe(deadline);
    expect(restored.question?.questionId).toBe(1);
    const saved = await answer(secondDevice, restored, true);
    await secondDevice.reload();
    const feedback = await session(secondDevice, first.sessionId);
    expect(feedback.state).toBe('AWAITING_ADVANCE');
    expect(feedback.question?.deadlineAt).toBe(deadline);
    expect(feedback.lastAnswer?.attemptAnswerId).toBe(saved.attemptAnswerId);
    await page.reload();
    await expect(page.getByRole('heading', { name: '정답이에요', exact: true })).toBeVisible();
    expect((await session(page, first.sessionId)).question?.deadlineAt).toBe(deadline);
    await page.goto(`/student/learning/sessions/${first.sessionId}/result`);
    await expect(page).toHaveURL(new RegExp(`/sessions/${first.sessionId}$`));
    expect((await session(page, first.sessionId)).answeredCount).toBe(1);
  } finally {
    await other.close();
  }
});

// Catches browser-authored timeout/advance and verifies the real scheduled PostgreSQL commit.
test('expiredQuestionRestoresServerTimeout', async ({ page }) => {
  await provisionLearner(page);
  const first = await start(
    page,
    page.getByRole('button', { name: '오늘 학습 시작', exact: true }),
    'FIRST',
    1,
  );
  let answerOrAdvancePosts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/(answers|advance)$/.test(new URL(request.url()).pathname))
      answerOrAdvancePosts++;
  });
  await expect
    .poll(async () => (await session(page, first.sessionId)).lastAnswer?.outcome, {
      timeout: 25000,
      intervals: [250, 500, 1000],
    })
    .toBe('TIMED_OUT');
  await expect(
    page.getByRole('heading', { name: '시간이 초과되었어요', exact: true }),
  ).toBeVisible();
  const expired = await session(page, first.sessionId);
  expect(expired.state).toBe('AWAITING_ADVANCE');
  expect(expired.answeredCount).toBe(1);
  expect(expired.question?.questionId).toBe(1);
  expect(expired.question?.deadlineAt).toBe(first.question?.deadlineAt);
  expect(expired.lastAnswer?.xpAwarded).toBe(374);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '시간이 초과되었어요', exact: true }),
  ).toBeVisible();
  expect((await session(page, first.sessionId)).lastAnswer?.attemptAnswerId).toBe(
    expired.lastAnswer?.attemptAnswerId,
  );
  expect(answerOrAdvancePosts).toBe(0);
  await page.getByRole('link', { name: '나의 문제', exact: true }).click();
  const timeoutRow = page.getByRole('list', { name: '개인 문제 목록' }).getByRole('listitem');
  await expect(timeoutRow.getByText('최근 결과: 시간 초과', { exact: true })).toBeVisible();
  await expect(
    timeoutRow.getByText('복습 미완료 · 다시 볼 목록에 있어요', { exact: true }),
  ).toBeVisible();
});

// Catches AUTO/USER queue conflation, lost mastery, implicit consent writes, or coupled stars.
test('privateQueueBookmarkAndConsentRemainIndependent', async ({ page }) => {
  await provisionLearner(page);
  const first = await start(
    page,
    page.getByRole('button', { name: '오늘 학습 시작', exact: true }),
    'FIRST',
    1,
  );
  await finishDay(page, first, [false, true, true, true, true]);
  await resultPage(page, first.sessionId, '회차 통과');
  await page.getByRole('link', { name: '나의 문제 보기', exact: true }).click();
  const row = page
    .getByRole('list', { name: '개인 문제 목록' })
    .getByRole('listitem')
    .filter({ hasText: '1회차 · 문항 1' });
  await expect(row).toBeVisible();
  await expect(row.getByText('최근 결과: 오답', { exact: true })).toBeVisible();
  await expect(row.getByText('복습 미완료 · 다시 볼 목록에 있어요', { exact: true })).toBeVisible();
  expect((await personal(page, 'REVIEW_QUEUE')).map((q) => q.questionId)).toEqual([1]);
  await layoutAndTargets(page);
  await row.getByRole('button', { name: '별표', exact: true }).click();
  await expect(row.getByRole('button', { name: '별표', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await personal(page, 'BOOKMARKED')).map((q) => q.questionId)).toEqual([1]);
  await page.getByRole('link', { name: '별표한 문제', exact: true }).click();
  await expect(page).toHaveURL(/filter=BOOKMARKED$/);
  await expect(row.getByText('최근 결과: 오답', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '다시 볼 문제', exact: true }).click();
  await row.getByRole('checkbox', { name: '복습할 문제 선택', exact: true }).check();
  const review = await start(
    page,
    page.getByRole('button', { name: '선택한 문제 복습하기', exact: true }),
    'REVIEW',
    null,
  );
  expect(review.questionCount).toBe(1);
  expect(review.question?.questionId).toBe(1);
  const mastered = await answer(page, review, true);
  expect(mastered.xpAwarded).toBe(1);
  expect(mastered.attemptState).toBeNull();
  expect(mastered.dayState).toBeNull();
  expect((await personal(page, 'REVIEW_QUEUE')).length).toBe(0);
  const mastery = (await personal(page, 'MASTERED')).find((q) => q.questionId === 1)!;
  expect(mastery.mastered).toBe(true);
  expect(mastery.bookmarked).toBe(true);
  expect(mastery.inReviewQueue).toBe(false);
  expect(mastery.lastOutcome).toBe('CORRECT');
  await resultPage(page, review.sessionId, '복습 풀이를 마쳤어요');
  await expect(
    page.getByText('문항별 복습 상태는 나의 문제에서 확인해 주세요.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '나의 문제 보기', exact: true }).click();
  await page.getByRole('link', { name: '복습 완료', exact: true }).click();
  await expect(page).toHaveURL(/filter=MASTERED$/);
  await expect(row.getByText('최근 결과: 정답', { exact: true })).toBeVisible();
  await expect(row.getByText('복습 완료', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: '별표', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('link', { name: '학습 홈으로', exact: true }).click();
  let replay = await start(
    page,
    page.getByRole('button', { name: '1회차 다시 풀기', exact: true }),
    'REPLAY',
    1,
  );
  const wrong = await answer(page, replay, false);
  expect(wrong.reviewPromptEligible).toBe(true);
  await expect(page.getByText('다시 볼 문제로 추가할까요?', { exact: true })).toBeVisible();
  let consentPuts = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname === `${root}/review-queue/1`)
      consentPuts++;
  });
  await page.getByRole('button', { name: '지금은 괜찮아요', exact: true }).click();
  await expect(page.getByText('다시 볼 문제로 추가할까요?', { exact: true })).toHaveCount(0);
  expect((await personal(page, 'REVIEW_QUEUE')).length).toBe(0);
  expect(consentPuts).toBe(0);
  await page.getByRole('link', { name: '나의 문제', exact: true }).click();
  await page.getByRole('link', { name: '복습 완료', exact: true }).click();
  await expect(row.getByText('최근 결과: 오답', { exact: true })).toBeVisible();
  await expect(row.getByText('복습 완료', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: '별표', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('button', { name: '선택한 문제 복습하기', exact: true }),
  ).toHaveCount(0); // No queued questions: show the active-session recovery, without a dead action.
  await page.getByRole('link', { name: '진행 중인 학습 이어풀기', exact: true }).click();
  await finishDay(page, await advance(page, replay.sessionId), [true, true, true, true]);
  await resultPage(page, replay.sessionId, '회차 통과');
  await page.getByRole('link', { name: '학습 홈으로', exact: true }).click();
  replay = await start(
    page,
    page.getByRole('button', { name: '1회차 다시 풀기', exact: true }),
    'REPLAY',
    1,
  );
  await answer(page, replay, false);
  await page.getByRole('button', { name: '추가하기', exact: true }).click();
  await expect(page.getByText('다시 볼 문제로 추가할까요?', { exact: true })).toHaveCount(0);
  expect(consentPuts).toBe(1);
  await finishDay(page, await advance(page, replay.sessionId), [true, true, true, true]);
  await resultPage(page, replay.sessionId, '회차 통과');
  await page.getByRole('link', { name: '나의 문제 보기', exact: true }).click();
  await expect(row.getByText('최근 결과: 오답', { exact: true })).toBeVisible();
  await expect(row.getByText('복습 완료 · 다시 볼 목록에 있어요', { exact: true })).toBeVisible();
  await row.getByRole('checkbox', { name: '복습할 문제 선택', exact: true }).check();
  const userReview = await start(
    page,
    page.getByRole('button', { name: '선택한 문제 복습하기', exact: true }),
    'REVIEW',
    null,
  );
  await answer(page, userReview, true);
  const retained = (await personal(page, 'REVIEW_QUEUE')).find((q) => q.questionId === 1)!;
  expect(retained.mastered).toBe(true);
  expect(retained.bookmarked).toBe(true);
  expect(retained.inReviewQueue).toBe(true);
  expect(retained.lastOutcome).toBe('CORRECT');
  await resultPage(page, userReview.sessionId, '복습 풀이를 마쳤어요');
  await page.getByRole('link', { name: '나의 문제 보기', exact: true }).click();
  await page.reload();
  await expect(row.getByText('최근 결과: 정답', { exact: true })).toBeVisible();
  await expect(row.getByText('복습 완료 · 다시 볼 목록에 있어요', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: '별표', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await row.getByRole('button', { name: '별표', exact: true }).click();
  await expect(row.getByRole('button', { name: '별표', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect((await personal(page, 'REVIEW_QUEUE')).map((q) => q.questionId)).toEqual([1]);
  expect((await personal(page, 'BOOKMARKED')).length).toBe(0);
  await row.getByRole('button', { name: '다시 볼 목록에서 제거', exact: true }).click();
  await expect(page.getByText('다시 볼 문제가 없어요.', { exact: true })).toBeVisible();
  expect((await personal(page, 'MASTERED')).find((q) => q.questionId === 1)?.mastered).toBe(true);
  await expect(
    page.getByRole('button', { name: '선택한 문제 복습하기', exact: true }),
  ).toHaveCount(0);
});
