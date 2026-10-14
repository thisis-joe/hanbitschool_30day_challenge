import { test, expect } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import type { ClassroomSummary } from '../src/features/staff/types';
import { signOut, studentLogin } from './helpers';
import {
  provisionLearner,
  start,
  answer,
  advance,
  finishDay,
  status,
  session,
  layoutAndTargets,
  resultPage,
  visibleFocus,
  captureSanitizedResultProof,
} from './learning-helpers';
import type { GameView, JourneyView } from '../src/features/game/types';
import { e2eBaseURL, e2eComposeProject } from '../playwright.config';

test('isolatedHarnessRejectsUnsafeTargetsBeforeDocker', () => {
  expect(e2eBaseURL('http://localhost:8088')).toBe('http://localhost:8088');
  expect(e2eBaseURL('http://127.0.0.1:8090')).toBe('http://127.0.0.1:8090');
  expect(e2eBaseURL('http://[::1]:8090')).toBe('http://[::1]:8090');
  for (const target of [
    'https://localhost:8090',
    'http://example.com',
    'http://127.0.0.1.evil.test',
    'http://user:secret@localhost',
    'http://localhost/path',
    'file:///tmp/test',
  ])
    expect(() => e2eBaseURL(target)).toThrow();
  expect(e2eComposeProject('hanbit-account-e2e')).toBe('hanbit-account-e2e');
  expect(e2eComposeProject('hanbit-game-e2e')).toBe('hanbit-game-e2e');
  for (const project of [
    '',
    'hanbit-prod',
    'hanbit-prod-e2e',
    'other-e2e',
    'hanbit-game-e2e\n',
    'hanbit-game-e2e;docker',
  ])
    expect(() => e2eComposeProject(project)).toThrow();
});

async function game(page: Page): Promise<GameView> {
  const response = await page.request.get('/api/student/game');
  expect(response.status()).toBe(200);
  return response.json();
}
async function journey(page: Page): Promise<JourneyView> {
  const response = await page.request.get('/api/student/learning/map');
  expect(response.status()).toBe(200);
  return response.json();
}
async function selectCharacter(page: Page, name = '보라') {
  await page.goto('/student/character');
  await expect(page.getByRole('heading', { name: '캐릭터 선택', exact: true })).toBeFocused();
  const saved = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/student/game/appearance' &&
      r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: `${name} 선택`, exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText(`지금 함께하는 친구: ${name}`, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '캐릭터 선택', exact: true })).not.toBeFocused();
}
async function firstPass(page: Page) {
  await page.goto('/student/learning');
  const view = await start(
    page,
    page.getByRole('button', { name: '오늘 학습 시작', exact: true }),
    'FIRST',
    1,
  );
  await finishDay(page, view, [true, true, true, true, true]);
  return view;
}

// Catches unsaved clothing, appearance reset on relogin, and missing six-slot persistence.
test('characterWardrobePersistsAcrossRelogin', async ({ page }) => {
  // Failure-only observation: do not delay or alter the existing provisioning actions.
  const observations: { method: string; status: number; parsed: boolean }[] = [];
  let created: ClassroomSummary | undefined;
  let requestedGrade: string | undefined;
  let listed: ClassroomSummary[] | undefined;
  let createdAt = -1;
  let listedAt = -1;
  let meIdentityPresent: boolean | undefined;
  let pendingReads = 0;
  let observationErrors = 0;
  const observe = async (response: Response) => {
    let path: string;
    try {
      path = new URL(response.url()).pathname;
    } catch {
      observationErrors++;
      return;
    }
    const method = response.request().method();
    if (!(
      (path === '/api/staff/classrooms' && ['POST', 'GET'].includes(method)) ||
      (path === '/api/auth/me' && method === 'GET')
    ))
      return;
    const event = {
      method: path === '/api/auth/me' ? 'ME' : method,
      status: response.status(),
      parsed: false,
    };
    observations.push(event);
    const eventIndex = observations.length - 1;
    pendingReads++;
    try {
      const body = await response.json();
      event.parsed = true;
      if (path === '/api/auth/me') meIdentityPresent = typeof body?.accountId === 'string';
      else if (method === 'POST') {
        createdAt = eventIndex;
        const requestBody = response.request().postDataJSON();
        requestedGrade =
          typeof requestBody?.gradeLabel === 'string' ? requestBody.gradeLabel : undefined;
        if (typeof body?.id === 'string' && typeof body?.gradeLabel === 'string') created = body;
        else observationErrors++;
      } else if (Array.isArray(body)) {
        if (eventIndex > listedAt) {
          listedAt = eventIndex;
          listed = body;
        }
      } else observationErrors++;
    } catch {
      observationErrors++;
    } finally {
      pendingReads--;
    }
  };
  page.on('response', observe);
  const c = await (async () => {
    try {
      return await provisionLearner(page);
    } catch (error) {
      let dom: object = { known: false };
      try {
        dom = await page.evaluate(
          ({ id, grade, classNumber }) => {
            const input = id ? document.getElementById('code-' + id) : null;
            const expected =
              grade === undefined ? undefined : `${grade} ${classNumber}반 가입 코드`;
            const labels = [...document.querySelectorAll('label')];
            return {
              known: true,
              matchedCodeIdCount: id
                ? document.querySelectorAll('#' + CSS.escape('code-' + id)).length
                : null,
              codeVisible: input
                ? input.getClientRects().length > 0 &&
                  getComputedStyle(input).visibility !== 'hidden'
                : false,
              expectedLabelPresent:
                expected === undefined
                  ? null
                  : labels.some((label) => label.textContent?.trim() === expected),
              codeLabelCorresponds:
                input && expected !== undefined
                  ? labels.some(
                      (label) =>
                        label.htmlFor === input.id && label.textContent?.trim() === expected,
                    )
                  : null,
              routeIsClassrooms: location.pathname === '/staff/classrooms',
            };
          },
          { id: created?.id, grade: requestedGrade, classNumber: created?.classNumber },
        );
      } catch {
        observationErrors++;
      }
      const subsequentListKnown = createdAt >= 0 && listedAt > createdAt && !!listed;
      const createdId = created?.id;
      const match = createdId && subsequentListKnown && listed?.find((row) => row.id === createdId);
      console.log(
        'PROVISION_BOUNDARY ' +
          JSON.stringify({
            observations,
            pendingReads,
            observationErrors,
            createdKnown: !!created,
            createdManageable: typeof created?.canManage === 'boolean' ? created.canManage : null,
            createdHasCode: created
              ? typeof created.joinCode === 'string' && created.joinCode.length > 0
              : null,
            createdGradeMatchesRequest:
              created && requestedGrade !== undefined
                ? created.gradeLabel === requestedGrade
                : null,
            subsequentListKnown,
            listCount: subsequentListKnown ? (listed?.length ?? null) : null,
            listContainsCreated: created && subsequentListKnown ? !!match : null,
            listedManageable:
              match && typeof match.canManage === 'boolean' ? match.canManage : null,
            listedHasCode: match
              ? typeof match.joinCode === 'string' && match.joinCode.length > 0
              : null,
            meIdentityPresent: meIdentityPresent ?? null,
            // ClassroomSummary has no creator field; a /me-to-creator comparison is unavailable.
            creatorComparisonKnown: false,
            errorClass:
              error instanceof Error && error.name === 'TimeoutError'
                ? 'TimeoutError'
                : 'OtherError',
            dom,
          }),
      );
      throw error;
    } finally {
      page.off('response', observe);
    }
  })();
  await expect(page.getByRole('heading', { name: '나의 학습', exact: true })).toBeFocused();
  await selectCharacter(page);
  await layoutAndTargets(page);
  await firstPass(page);
  await page.goto('/student/closet');
  await expect(page.getByRole('heading', { name: '나의 옷장', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '책벌레안경 미리보기', exact: true }).click();
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith('/game/appearance'),
  );
  await page.getByRole('button', { name: '착용하기', exact: true }).click();
  expect((await saved).status()).toBe(200);
  const before = await game(page);
  expect(before.characterId).toBe('bora');
  expect(before.equippedBySlot).toEqual({
    face: 'face-1',
    hat: null,
    top: null,
    bottom: null,
    shoes: null,
    hand: null,
  });
  await signOut(page);
  await studentLogin(page, '한빛학교', c.gradeLabel, 1, 1, 'Student!2026');
  await page.goto('/student/closet');
  await expect(page.getByRole('button', { name: '책벌레안경 미리보기' })).toContainText('착용 중');
  expect(await game(page)).toEqual(before);
  await layoutAndTargets(page);
});

// Catches gifts paid by navigation instead of answer five, duplicate gift grants and inflated repeat XP.
test('firstPassGiftSavesWithoutFinishAndReplayPaysOnlyRepeatXp', async ({ page }) => {
  await provisionLearner(page);
  const view = await firstPass(page);
  const saved = await game(page);
  expect(saved.inventory.filter((i) => i.owned).map((i) => i.itemId)).toEqual(['face-1']);
  expect((await status(page)).totalXp).toBe(5069);
  await page.reload();
  expect((await game(page)).inventory).toEqual(saved.inventory);
  await resultPage(page, view.sessionId, '회차 통과');
  await expect(page.getByRole('region', { name: '여행 선물' })).toContainText('책벌레안경');
  await layoutAndTargets(page);
  await captureSanitizedResultProof(page);
  await page.goto('/student/learning');
  const replay = await start(
    page,
    page.getByRole('button', { name: '1회차 다시 풀기', exact: true }),
    'REPLAY',
    1,
  );
  const results = await finishDay(page, replay, [false, false, false, false, false]);
  expect(results.map((r) => r.xpAwarded)).toEqual([1, 1, 1, 1, 1]);
  expect(results.at(-1)?.dayState).toBe('PASSED');
  expect((await game(page)).inventory).toEqual(saved.inventory);
  expect((await status(page)).totalXp).toBe(5074);
  const bookmark = page.getByRole('button', { name: '별표', exact: true });
  await bookmark.click();
  await expect(bookmark).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/student/questions?filter=BOOKMARKED');
  await expect(page.getByRole('list', { name: '개인 문제 목록' })).toBeVisible();
  await layoutAndTargets(page);
});

// Catches preview writes or server ownership bypass through a forged appearance request.
test('lockedPreviewCannotBecomeSavedGear', async ({ page }) => {
  await provisionLearner(page);
  const before = await game(page);
  await page.goto('/student/closet');
  let writes = 0;
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().endsWith('/game/appearance')) writes++;
  });
  await page.getByRole('button', { name: '모자 장비 보기', exact: true }).click();
  await page.getByRole('button', { name: '새벽왕관 미리보기', exact: true }).click();
  await expect(page.getByRole('region', { name: '외형 미리보기' })).toContainText('미보유');
  await expect(page.getByRole('button', { name: '착용하기', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '미리보기 취소' }).click();
  expect(writes).toBe(0);
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  const forged = await page.request.put('/api/student/game/appearance', {
    headers: { [csrf.headerName]: csrf.token },
    data: {
      characterId: 'haru',
      expectedRevision: before.revision,
      equippedBySlot: { ...before.equippedBySlot, hat: 'hat-5' },
    },
  });
  expect(forged.status()).toBe(409);
  expect(await game(page)).toEqual(before);
  await layoutAndTargets(page);
});

// Catches replay replacing first facts, future unlocks and map authority derived from current attempt.
test('mapUsesFirstFactsAndServerLocks', async ({ page }) => {
  await provisionLearner(page);
  await page.goto('/student/map');
  await expect(page.getByRole('heading', { name: '탐험 지도', exact: true })).toBeFocused();
  await layoutAndTargets(page);
  await expect(page.getByRole('button', { name: '2회차 시작하기', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '3회차 시작하기', exact: true })).toBeDisabled();
  const first = await start(
    page,
    page.getByRole('button', { name: '오늘 학습 시작', exact: true }),
    'FIRST',
    1,
  );
  await finishDay(page, first, [true, true, false, false, false]);
  const facts = await journey(page);
  expect(facts.journeyPosition).toBe(5);
  expect(facts.firstAnswerCount).toBe(5);
  expect(facts.days[0].state).toBe('RETRY_REQUIRED');
  expect(facts.days[1].availability).not.toBe('AVAILABLE');
  await page.goto('/student/map');
  const replay = await start(
    page,
    page.getByRole('button', { name: '다시 도전하기', exact: true }),
    'REPLAY',
    1,
  );
  await finishDay(page, replay, [true, true, true, true, true]);
  const passed = await journey(page);
  expect(passed.questions).toEqual(facts.questions);
  expect(passed.journeyPosition).toBe(5);
  expect(passed.days[0].state).toBe('PASSED');
  expect(passed.days[1].availability).toBe('AVAILABLE');
  expect(passed.days[2].availability).toBe('LOCKED_DATE');
  await page.goto('/student/map');
  await expect(page.getByRole('button', { name: '2회차 시작하기', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '3회차 시작하기', exact: true })).toBeDisabled();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const recenter = page.getByRole('button', { name: '현재 위치로 돌아가기' });
  await recenter.focus();
  await visibleFocus(recenter);
  await recenter.press('Enter');
  await layoutAndTargets(page);
});

// Catches character gating/direct-route redirects and regenerated server deadlines.
test('directActiveSessionSurvivesMissingCharacter', async ({ page }) => {
  const c = await provisionLearner(page);
  expect((await game(page)).characterId).toBeNull();
  await layoutAndTargets(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.game-avatar-idle')).toHaveCSS('animation-name', 'none');
  const first = await start(
    page,
    page.getByRole('button', { name: '오늘 학습 시작', exact: true }),
    'FIRST',
    1,
  );
  await page.goto(`/student/learning/sessions/${first.sessionId}`);
  await expect(page.getByRole('heading', { name: '문항 1 / 5', exact: true })).toBeVisible();
  expect((await session(page, first.sessionId)).question?.deadlineAt).toBe(
    first.question?.deadlineAt,
  );
  await layoutAndTargets(page);
  await signOut(page);
  await studentLogin(page, '한빛학교', c.gradeLabel, 1, 1, 'Student!2026');
  await page.goto(`/student/learning/sessions/${first.sessionId}`);
  expect((await session(page, first.sessionId)).question?.deadlineAt).toBe(
    first.question?.deadlineAt,
  );
  expect((await game(page)).characterId).toBeNull();
});

// Real same-account tabs must recover a stale revision without automatically replaying the write.
test('twoTabsRecoverRevisionConflictBeforeAnExplicitNewSave', async ({ page, context }) => {
  await provisionLearner(page);
  await page.goto('/student/character');
  await expect(page.getByRole('button', { name: '하루 선택' })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/student/character');
  await expect(other.getByRole('button', { name: '하루 선택' })).toBeVisible();
  await selectCharacter(page);
  const conflict = other.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith('/game/appearance'),
  );
  await other.getByRole('button', { name: '하루 선택' }).click();
  expect((await conflict).status()).toBe(409);
  await expect(other.getByText('지금 함께하는 친구: 보라', { exact: true })).toBeVisible();
  expect((await game(other)).revision).toBe(1);
  const saved = other.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith('/game/appearance'),
  );
  await other.getByRole('button', { name: '하루 선택' }).click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.getByText('지금 함께하는 친구: 하루', { exact: true })).toBeVisible();
  expect((await game(page)).revision).toBe(2);
  await other.close();
});

// Delay actual cosmetic responses after answer one; the canonical learning command must still settle.
test('cosmeticReadsCannotHoldTheLearningCommandOrResetItsDeadline', async ({ page }) => {
  await provisionLearner(page);
  const first = await start(
    page,
    page.getByRole('button', { name: '오늘 학습 시작', exact: true }),
    'FIRST',
    1,
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = 0;
  await page.route(/\/api\/student\/(game|learning\/map)$/, async (route) => {
    const response = await route.fetch();
    held++;
    await gate;
    await route.fulfill({ response });
  });
  try {
    await answer(page, first, true);
    await expect.poll(() => held).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole('button', { name: '다음 문제', exact: true })).toBeEnabled();
    expect((await session(page, first.sessionId)).question?.deadlineAt).toBe(
      first.question?.deadlineAt,
    );
    const second = await advance(page, first.sessionId);
    expect(second.question?.position).toBe(2);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

// Uses normally earned saved reward and actual GETs; fault injection never fabricates a game snapshot.
test('finalPresentationGuideRecoveryAndGiftPreview', async ({ page }) => {
  await provisionLearner(page);
  let puts = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/game/appearance')) puts++;
  });
  await expect(
    page.getByText('아직 여행 친구를 선택하지 않았어요.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '캐릭터 선택하기', exact: true })).toHaveAttribute(
    'href',
    '/student/character',
  );
  await layoutAndTargets(page);
  expect(puts).toBe(0);

  let failing = true;
  await page.route(/\/api\/student\/(game|learning\/map)$/, async (route) => {
    const actual = await route.fetch();
    expect(actual.status()).toBe(200);
    if (failing) await route.abort('failed');
    else await route.fulfill({ response: actual });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: '여행 친구 다시 불러오기' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '지도 다시 불러오기' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '오늘 학습 시작', exact: true })).toBeEnabled();
  await layoutAndTargets(page);
  failing = false;
  await page.getByRole('button', { name: '여행 친구 다시 불러오기' }).click();
  await page.getByRole('button', { name: '지도 다시 불러오기' }).click();
  await expect(page.getByRole('button', { name: '여행 친구 다시 불러오기' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '지도 다시 불러오기' })).toHaveCount(0);
  expect(puts).toBe(0);
  const first = await firstPass(page);
  const saved = await game(page);
  const xp = (await status(page)).totalXp;
  expect(saved.characterId).toBeNull();
  expect(saved.equippedBySlot.face).toBeNull();
  await resultPage(page, first.sessionId, '회차 통과');
  const preview = page.getByRole('region', { name: '선물 착용 미리보기' });
  await expect(preview).toContainText('미리보기예요. 지금 착용하기를 누르면 저장돼요.');
  await expect(preview.getByRole('img', { name: /캐릭터 미선택/ })).toBeVisible();
  await layoutAndTargets(page);
  expect(await game(page)).toEqual(saved);
  expect((await status(page)).totalXp).toBe(xp);
  expect(puts).toBe(0);
  // Once both real canvases finish, preview pixels must differ from the saved unequipped scene.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const picture = (selector: string) => {
          const canvas = document.querySelector<HTMLCanvasElement>(selector)!;
          return Array.from(canvas.getContext('2d')!.getImageData(0, 0, 128, 176).data);
        };
        const saved = picture('.game-learning-scene canvas');
        const preview = picture('.learning-gift-preview canvas');
        return (
          saved.some((value) => value !== 0) &&
          preview.some((value) => value !== 0) &&
          saved.some((value, index) => value !== preview[index])
        );
      }),
    )
    .toBe(true);
  await captureSanitizedResultProof(page);
  failing = true;
  await page.reload();
  await expect(page.getByRole('button', { name: '여행 친구 다시 불러오기' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '지도 다시 불러오기' })).toBeEnabled();
  await expect(page.getByText('저장된 선물 정보를 불러오고 있어요.', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: '다음 회차 시작', exact: true })).toBeEnabled();
  await layoutAndTargets(page);
  failing = false;
  await page.getByRole('button', { name: '여행 친구 다시 불러오기' }).click();
  await page.getByRole('button', { name: '지도 다시 불러오기' }).click();
  await expect(preview).toBeVisible();
  expect(puts).toBe(0);
  expect(await game(page)).toEqual(saved);
  await page.unrouteAll({ behavior: 'wait' });
  const put = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().endsWith('/game/appearance'),
  );
  await page.getByRole('button', { name: '지금 착용하기', exact: true }).click();
  expect((await put).status()).toBe(200);
  expect(puts).toBe(1);
  const worn = await game(page);
  expect(worn.characterId).toBeNull();
  expect(worn.equippedBySlot).toEqual({
    face: 'face-1',
    hat: null,
    top: null,
    bottom: null,
    shoes: null,
    hand: null,
  });
  expect((await status(page)).totalXp).toBe(xp);
});
