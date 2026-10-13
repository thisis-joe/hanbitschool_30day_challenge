import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { provisionLearningClass, protectedEqual, protectedText } from './learning-helpers';

const checkout = fileURLToPath(new URL('../../', import.meta.url));
const markers = ['FIXTURE-CANARY-QUESTION', 'FIXTURE-CANARY-EXPLANATION', 'FIXTURE-CANARY-STUDENT'];
async function diagnostic(action: () => unknown | Promise<unknown>) {
  try {
    await action();
    return '';
  } catch (error) {
    if (!(error instanceof Error)) return String(error);
    return `${error.message}\n${error.stack}\n${JSON.stringify(error)}`;
  }
}
function expectRedactedFailure(output: string) {
  expect(output.length > 0).toBe(true);
  expect(markers.some((marker) => output.includes(marker))).toBe(false);
}
function controlledFixture(mismatch?: string) {
  const activity = { apiReads: 0, pageWrites: 0, inspections: 0 };
  const page = {
    on() {},
    request: {
      async get() {
        activity.apiReads++;
        return { status: () => 200, headers: () => ({ date: 'Tue, 13 Oct 2026 12:00:00 GMT' }) };
      },
    },
    async goto() {
      activity.pageWrites++;
      throw new Error('Controlled fixture write boundary');
    },
  } as unknown as Page;
  const inspect = (args: string[]) => {
    // Ownership inspection must complete before any fixture read or page/account write.
    expect([activity.apiReads, activity.pageWrites]).toEqual([0, 0]);
    activity.inspections++;
    const target = args.at(-1)!;
    if (args[0] === 'volume')
      return JSON.stringify({
        'com.docker.compose.project': mismatch === 'volume-label' ? 'unowned' : 'hanbit-game-e2e',
        'com.docker.compose.volume': 'school-data',
      });
    if (args.includes('{{json .Mounts}}'))
      return JSON.stringify([
        {
          Type: 'volume',
          Name: mismatch === 'volume-mount' ? 'unowned-data' : 'hanbit-game-e2e_school-data',
          Destination: '/var/lib/postgresql/data',
        },
      ]);
    if (args.includes('{{json .HostConfig.PortBindings}}'))
      return JSON.stringify({
        '80/tcp': [{ HostIp: mismatch === 'binding' ? '0.0.0.0' : '127.0.0.1', HostPort: '8090' }],
      });
    return JSON.stringify({
      'com.docker.compose.project': 'hanbit-game-e2e',
      'com.docker.compose.service': mismatch === 'service' ? 'unowned' : target.split('-').at(-2),
      'com.docker.compose.project.working_dir':
        mismatch === 'workdir' ? '/unowned' : resolve(checkout, 'infra'),
      'com.docker.compose.project.config_files':
        mismatch === 'config'
          ? '/unowned/compose.yml'
          : resolve(checkout, 'infra/compose.local.yml'),
    });
  };
  return { page, inspect, activity };
}
async function withTarget(
  base: string | undefined,
  project: string | undefined,
  action: () => Promise<void>,
) {
  const previous = {
    base: process.env.HANBIT_E2E_BASE_URL,
    project: process.env.HANBIT_E2E_COMPOSE_PROJECT,
  };
  if (base === undefined) delete process.env.HANBIT_E2E_BASE_URL;
  else process.env.HANBIT_E2E_BASE_URL = base;
  if (project === undefined) delete process.env.HANBIT_E2E_COMPOSE_PROJECT;
  else process.env.HANBIT_E2E_COMPOSE_PROJECT = project;
  try {
    await action();
  } finally {
    if (previous.base === undefined) delete process.env.HANBIT_E2E_BASE_URL;
    else process.env.HANBIT_E2E_BASE_URL = previous.base;
    if (previous.project === undefined) delete process.env.HANBIT_E2E_COMPOSE_PROJECT;
    else process.env.HANBIT_E2E_COMPOSE_PROJECT = previous.project;
  }
}

test('fixtureRejectsDefaultAndOtherLoopbackBeforeAnyReadOrWrite', async () => {
  for (const [base, project] of [
    [undefined, undefined],
    ['http://127.0.0.1:8088', 'hanbit-game-e2e'],
    ['http://127.0.0.1:8090', 'hanbit-account-e2e'],
  ]) {
    await withTarget(base, project, async () => {
      const stub = controlledFixture();
      const error = await diagnostic(() => provisionLearningClass(stub.page, 2, stub.inspect));
      expect([stub.activity.apiReads, stub.activity.pageWrites, stub.activity.inspections]).toEqual(
        [0, 0, 0],
      );
      expect(error.includes('requires its owned loopback target')).toBe(true);
    });
  }
});
for (const mismatch of [
  'service',
  'workdir',
  'config',
  'volume-mount',
  'volume-label',
  'binding',
]) {
  test(`fixtureRejectsUnowned${mismatch}BeforeAnyReadOrWrite`, async () => {
    await withTarget('http://127.0.0.1:8090', 'hanbit-game-e2e', async () => {
      const stub = controlledFixture(mismatch);
      const error = await diagnostic(() => provisionLearningClass(stub.page, 2, stub.inspect));
      expect([stub.activity.apiReads, stub.activity.pageWrites]).toEqual([0, 0]);
      expect(stub.activity.inspections).toBeGreaterThan(0);
      expect(error.includes('mismatch')).toBe(true);
    });
  });
}
test('validOwnedInspectionCompletesBeforeTheFirstFixtureBoundary', async () => {
  await withTarget('http://127.0.0.1:8090', 'hanbit-game-e2e', async () => {
    const stub = controlledFixture();
    const error = await diagnostic(() => provisionLearningClass(stub.page, 2, stub.inspect));
    expect(error.includes('Controlled fixture write boundary')).toBe(true);
    expect(stub.activity).toEqual({ apiReads: 1, pageWrites: 1, inspections: 6 });
  });
});

test('protectedDtoMismatchNeverSerializesCanonicalOrStudentValues', async () => {
  const before = {
    name: markers[2],
    answers: [{ text: markers[0], explanation: markers[1], firstChoice: 'X' }],
  };
  const after = { ...before, answers: [{ ...before.answers[0], firstChoice: 'O' }] };
  expectRedactedFailure(await diagnostic(() => protectedEqual(after, before)));
});
test('protectedJsonChecksEveryFieldAndArrayOrder', async () => {
  const expected = {
    answers: [
      { number: 1, chosen: 'X' },
      { number: 2, chosen: null },
    ],
    correct: 0,
  };
  protectedEqual(structuredClone(expected), expected);
  for (const actual of [
    { ...expected, extra: true },
    { ...expected, correct: '0' },
    { ...expected, answers: [...expected.answers].reverse() },
    { ...expected, answers: [{ number: 1 }, expected.answers[1]] },
  ]) {
    expect((await diagnostic(() => protectedEqual(actual, expected))).length > 0).toBe(true);
  }
});
test('protectedExactTextMismatchNeverSerializesEitherValue', async ({ page }) => {
  await page.setContent(`<p>${markers[0]}</p>`);
  expectRedactedFailure(
    await diagnostic(() => protectedText(page.locator('p'), markers[1], { timeout: 30 })),
  );
});
test('protectedContainsMismatchNeverSerializesTeacherText', async ({ page }) => {
  await page.setContent(`<p>${markers[0]} ${markers[2]}</p>`);
  expectRedactedFailure(
    await diagnostic(() =>
      protectedText(page.locator('p'), markers[1], { contains: true, timeout: 30 }),
    ),
  );
});
test('protectedInputMismatchNeverSerializesEitherValue', async ({ page }) => {
  await page.setContent(`<input value="${markers[2]}">`);
  expectRedactedFailure(
    await diagnostic(() =>
      protectedText(page.locator('input'), markers[1], { value: true, timeout: 30 }),
    ),
  );
});
test('protectedTextPreservesNormalizedExactContainsAndRawInputSemantics', async ({ page }) => {
  await page.setContent('<p>  first\u200b  \n answer\u00ad </p><input value=" first  answer ">');
  await protectedText(page.locator('p'), 'first answer');
  await protectedText(page.locator('p'), 'first  answer', { contains: true });
  await protectedText(page.locator('input'), ' first  answer ', { value: true });
  expect(
    (await diagnostic(() => protectedText(page.locator('p'), 'answer', { timeout: 30 }))).length >
      0,
  ).toBe(true);
  expect(
    (
      await diagnostic(() =>
        protectedText(page.locator('input'), 'first answer', { value: true, timeout: 30 }),
      )
    ).length > 0,
  ).toBe(true);
});
