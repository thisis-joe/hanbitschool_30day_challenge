# Task 4 report — saved characters and owned wardrobe

Status: DONE

Worktree: `/Users/Joseph/.codex/worktrees/student-game-ui-design/hanbitschool_30day_challenge`
Branch: `feat/student-game-ui`
Baseline: `ce88378e13c9c7d969b11b4ad6fc02d47f9f3522`

## Implemented

- Exact backend GameView, AppearanceCommand, character/item/inventory, JourneyView/day/question fields mirrored in frontend game types. Nullable timestamps use `string | null`; revisions remain numbers. Learning enum types are reused rather than duplicated.
- Shared HTTP requests for GET `/api/student/game`, PUT `/api/student/game/appearance`, and GET `/api/student/learning/map`, preserving the existing CSRF, account epoch, no-store, credential and AbortSignal behavior.
- `gameKeys.view(accountId)` and `gameKeys.journey(accountId)` incorporate the actual account plus frozen `hanbit-v1` and `game-v1` course/catalog context. Both hooks are disabled for non-students and forward query cancellation signals.
- STUDENT routes `/student/character` and `/student/closet`. All nine local original characters are selectable, existing gear survives character changes, and accepted server state restores the selection after remount.
- Every appearance command explicitly copies all six slots and the current revision. Wearing equipment before character selection retains `characterId: null`; rendering haru never selects or saves it automatically. An initial game read causes no appearance PUT, and direct active-session routes never query or gate on game setup.
- Saves serialize accepted intents using synchronous flight identity, and guard before requests, recovery, cache publication and React updates with mounted/owner/epoch/AbortSignal checks. Cleanup subscribes to the existing account lifetime cleanup without changing auth behavior. Older query requests are canceled before saving. A higher existing cache revision is preserved rather than overwritten by a late response.
- Uncertain responses and 409 recover with canonical GET; PUT is never automatically retried. Only a canonical character and complete equipment match resolve successfully; a different appearance reports a recoverable Korean conflict and publishes canonical server state. Definite rejection and failed canonical recovery remain recoverable.
- Wardrobe ownership comes from inventory. Unowned items have local preview only, readable names/unlock text and filtered artwork alone. Cancel restores saved gear. Preview identity is scoped to account/epoch/location, and completion clears only its own preview intent, preserving a newer local preview. Rendering uses local item-id artwork; assetKey/server names never become executable markup.
- Stable `game-*` classes support Task 5 theme work. Existing learning containers are reused, with wrapping responsive grids and 48px button minimums. No shared style, auth, dependency or environment changes were made.

## TDD evidence

All commands prepend the provided Node 24 runtime:

```sh
export PATH=/Users/Joseph/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
```

RED command before production implementation:

```sh
pnpm --dir frontend test src/features/game/api.test.ts src/features/game/useAppearance.test.tsx src/features/game/CharacterSelectionPage.test.tsx src/features/game/ClosetPage.test.tsx
```

Relevant output:

```text
FAIL src/features/game/api.test.ts
Error: Failed to resolve import "./api" ... Does the file exist?
FAIL src/features/game/useAppearance.test.tsx
Error: Failed to resolve import "./queries" ... Does the file exist?
FAIL selectsAndRestoresAllNineCharacters
Unable to find role="heading" and name "캐릭터 선택"
FAIL unownedPreviewNeverPutsAndCancelRestoresSavedGear
FAIL ownedEquipAndBaseRestoreSendSixSlotsAndRevision
FAIL unknownCatalogArtDoesNotExecuteMarkup
FAIL previewClearsImmediatelyWhenOwnerChanges
Test Files 4 failed (4)
Tests 5 failed (5)
```

The five real App/router/MSW page tests failed because the routes did not exist (the not-found page rendered). API and hook imports also did not exist; these were missing-feature suite errors, not exercised behavior assertions. This distinction is recorded explicitly.

Initial GREEN after implementing APIs/hooks/pages/routes with the same four-file command:

```text
Test Files 4 passed (4)
Tests 13 passed (13)
Duration 1.26s
```

Additional coverage then brought this task to 18 tests: initial unselected GET/no write; direct active learning with absent/error game setup; serialized concurrent intents; definite rejection and failed recovery. The production behavior already met these extra boundaries.

An intermediate build identified `ClosetPage.tsx TS18047: 'preview' is possibly 'null'`; the preview predicate now explicitly narrows `preview` before reading its epoch/route. An expanded hook run exposed a test fixture interaction between an aborted A query and reuse of its held MSW handler for B (native fetch connection refused despite handler entry). The fixture now gives B a distinct immediate handler and verifies the original AbortSignal at the real fetch boundary. No production auth/query change was required. Temporary diagnostics were removed.

Final focused GREEN plus auth isolation:

```sh
pnpm --dir frontend test src/features/game/api.test.ts src/features/game/useAppearance.test.tsx src/features/game/CharacterSelectionPage.test.tsx src/features/game/ClosetPage.test.tsx src/features/auth/AccountLifetime.test.tsx src/features/auth/AuthSession.test.tsx
```

```text
Test Files 6 passed (6)
Tests 37 passed (37)
Duration 1.88s
```

## Final verification

The entire frontend suite ran once after focused iteration and before the task commit:

```sh
pnpm --dir frontend test
```

```text
RUN v5.0.3 .../frontend
Test Files 24 passed (24)
Tests 191 passed (191)
Duration 5.98s
```

No test failure, warning or React update error occurred. Vitest additionally printed its informational jsdom performance suggestion (24 environments, 15.23 seconds aggregate), which is not a correctness warning.

```sh
pnpm --dir frontend build
```

```text
$ tsc -b && vite build
vite v8.3.4 building client environment for production...
110 modules transformed.
dist/index.html 0.39 kB | gzip: 0.29 kB
dist/assets/index-UOwmHDOA.css 11.20 kB | gzip: 3.04 kB
dist/assets/index-BSlSmzBH.js 383.73 kB | gzip: 118.88 kB
built in 188ms
```

Exit code 0.

```sh
pnpm --dir frontend lint
```

```text
$ eslint .
```

Exit code 0; no findings.

## Files changed

- `frontend/src/features/game/types.ts`
- `frontend/src/features/game/api.ts` and `api.test.ts`
- `frontend/src/features/game/queries.ts`
- `frontend/src/features/game/useAppearance.ts` and `useAppearance.test.tsx`
- `frontend/src/features/game/CharacterSelectionPage.tsx` and `.test.tsx`
- `frontend/src/features/game/ClosetPage.tsx` and `.test.tsx`
- `frontend/src/test/gameFixtures.ts`
- `frontend/src/app/router.tsx`
- This report.

## Self-review and concerns

Read the complete task brief/global constraints and implementer/TDD/good-tests references. Applied the React best-practices checklist after multiple TSX edits: hooks are unconditional, dependencies use owner identity, query fetching deduplicates through React Query, event-owned preview changes use functional updates for completion, lists have stable identities, all user-facing copy is Korean, native buttons expose selection/disabled states, SVG markup stays behind the local whitelist, and reduced-motion/avatar behavior is unchanged.

Reviewed all changed files and simulated realistic mutations: dropping owner/epoch checks breaks late-owner tests; retrying PUT breaks put-count checks; sending partial slots or selecting haru from null breaks payload assertions; losing character equipment breaks the nine-character journey; omitting preview scope breaks account transition; publishing older data breaks revision preservation; injecting catalog markup breaks the DOM checks.

No correctness concerns remain from the scoped implementation or automated checks. Browser pixel/layout evidence at 360px/desktop is not claimed here; Task 5's shared theme and subsequent integrated visual checks own that evidence. Links expose the two pages to each other and learning home; global student navigation is intentionally left for Task 5. No push/PR/merge/deploy, production data, credentials, new dependencies, new authentication or new reward economy was used.
