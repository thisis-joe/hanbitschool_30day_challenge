# Student game experience verification — 2026-10-13

Final combined teacher/game build (Task 4, product CSS fix `98fa2f2`): actual emitted JS `index-BAkZ6X2e.js`, SHA-256 `528ea334d5ee687ea427009c71858d4f04524073006ca28acb3aabbb86f3b576`; canonical **150 questions / 300 raw and JSON-escaped text/explanation strings / 0 matches**. Fresh combined gates: **600 backend / 37 suites / 0 failures-errors-skips; 255 frontend / 32 files; build/lint/strict E2E TypeScript; Node2; entire Chromium34**. New combined restart proves saved avatar, six-slot gear, gift, map, learning session/history/XP and teacher statistics. Full provenance, earlier failed runs/known unit intermittency and pending final reviews are in [teacher verification](2026-10-13-teacher-learning-statistics.md); historical student-phase entries below remain historical.

This is the student/game phase, on `feat/student-game-ui` in the isolated `student-game-ui-design` worktree. The teacher plan and final whole-branch review remain required; this record does not close the overall goal.

Task 7 began at `ee4b86919f947158c9d1a6d88d7d910f43065085`. During actual-browser verification, the shared-theme owner separately fixed the proven G13 width gap in `00390115db16532885508416e095d8a26eb39f5f`; scoped review marked it addressed. Task 7 changes are harness, fixture, local target configuration and evidence only. No learning/game production behavior was changed by Task 7.

## Isolated execution and provenance

- Fresh synthetic credentials were generated in this worktree's ignored `.env.e2e.local`, mode 600, with `HANBIT_HTTP_PORT=8090`. No prior/production credential values were read or reused. No pre-existing E2E env was present; the preparation also had a recoverable backup path for that case.
- Validated project `hanbit-game-e2e` was absent before creation. Existing project ownership is checked using exact Compose project and worktree labels before restart/recreate. Its DB uses its own `school-data` volume. Default 8088, production services and other volumes were not changed.
- Silent `compose config --quiet`; build backend/web; start db/backend and await health; start web and poll `/api/auth/csrf` to HTTP 200. No fixed startup sleep or restart after an observation timeout.
- Both account-test restart sites use validated project names and preserve backend → Docker `healthy` → web → HTTP 200 ordering. The second removes bootstrap ID/password only in a mode-600 test env copy and verifies existing administrator login still works.
- Browser target: `HANBIT_E2E_BASE_URL=http://127.0.0.1:8090`; project override: `HANBIT_E2E_COMPOSE_PROJECT=hanbit-game-e2e`. Defaults remain `http://localhost:8088` and `hanbit-account-e2e`. Non-loopback/non-HTTP/authenticated/path-bearing base URLs, malformed/projectless/production project values are rejected before mutation.
- Vite art fixture: `127.0.0.1:8091`, `HANBIT_GEAR_QA_URL=http://127.0.0.1:8091/e2e/fixtures/equipment-review.html`. The fixture imports the shared renderer, has no auth or learner records, and is not a production route/build entry.
- Account, classroom, learner, answers, inventory and appearance data in browser flows are created through normal UI/API requests against the fresh isolated PostgreSQL database. No SQL state seeds are used by Task 7 browser tests. Backend integration tests separately use their existing synthetic Testcontainers fixtures, including legacy PASSED/JSON compatibility cases; they are not represented as browser journeys.
- Trace, video, automatic screenshots remain off; `preserveOutput: 'never'` remains set. Evidence writing is now **opt-in per plan and unique execution**; default runs do not read/create any SDD workspace. When enabled, only art-only images, sanitized synthetic **result** proof and aggregate layout measurements are retained under that run's ignored folder. Other redacted page images were transient visual-review material and were removed after review. No account/login/credential screenshot is retained. The permanent capture helper asserts a result route and hides header, travel navigation, learner eyebrow, question/answer/explanation content.

## TDD and corrections observed

1. `pnpm test:e2e e2e/equipment-renderer.spec.ts` against the empty art-only fixture: **1 failed**, expected `html[data-ready="true"]`, received absent/empty. Then the fixture was implemented to await all renderer promises.
2. The first populated art run encountered a Vite HMR navigation while config was being edited (`Execution context was destroyed`). With edits settled, a stable rerun passed: **1 test**, **72 nonempty actual/reference pairs**, **0 differing RGBA channels**. This was a harness/environment observation, not a product-art change.
3. Initial game browser run: **1 passed, 5 failed**. Width assertions exposed `내 정보` and `학습 홈` at **35.671875 × 48px**, and `옷장` at **21.59375 × 48px** at 360px. One map measurement also needed a hydration wait. The test-only helper now waits for the learning page and measures both axes. No width assertion was relaxed.
4. Product evidence was escalated before a product edit. Task 7 was held while the original shared-theme owner added exactly two `min-width: 48px` declarations, committed separately as `0039011`, tested and reviewed. Focused Task 7 game cases then passed **6/6**.
5. Added synthetic visual proof initially assumed first-pass correctness meant `MASTERED`; the real API correctly returned no mastered rows. The test fixture now explicitly bookmarks an answered question through the real UI before photographing the BOOKMARKED view. The original reward/XP assertions remain intact. The corrected covering test passed.

## Requirement evidence and limits

| ID | Evidence | Boundary/limit |
| --- | --- | --- |
| G01 | `GameCatalogTest` checks nine stable characters and all thirty reward slot/day mappings. `node --test scripts/extract-game-assets.test.mjs` checks all nine PNG/six WebP bytes against pinned SHA-256 and manifest entries. | No new image bytes or authored poses. |
| G02 | Browser `characterWardrobePersistsAcrossRelogin`: select 보라, earn face-1, equip through PUT, assert all six slots, sign out/in, identical saved view and equipped UI. `lockedPreviewCannotBecomeSavedGear`: no preview PUT; forged unowned hat-5 PUT returns 409 and stored view unchanged. Backend `rejectsUnownedUnknownWrongSlotAndIncompleteEquipment` covers remaining rejection cases. | Browser wardrobe ownership is normally earned through answers, never SQL. |
| G03 | Browser `twoTabsRecoverRevisionConflictBeforeAnExplicitNewSave`: stale second-tab PUT returns 409, canonical revision 1 restored, explicit new save produces revision 2, first tab reload agrees. Existing `useAppearance`/query tests cover dropped responses, owner/epoch changes and late lower-revision GET publication. | Owner/course/catalog cache and monotonic revision races are also controlled hook tests; not all are physically raced over the network in E2E. |
| G04 | Backend `GameRewardIT`: FIRST 3/5 pass, failed FIRST then REPLAY pass, expired fifth answer grant ownership with real PostgreSQL. Browser first-pass and failed-then-replay map cases use real answer transactions. | Worker timeout reward edge is verified in backend integration; browser expiry recovery is covered by the existing learning flow. |
| G05 | Browser repeats award `[1,1,1,1,1]`, preserve first-pass inventory/acquisition records, preserve PASSED on all-wrong replay; total XP 5069 → 5074. Existing backend idempotency and existing-PASSED tests cover duplicate requests and legacy rows. | No invented reward economy or XP version change. |
| G06 | Browser checks face-1 inventory and saved XP immediately after answer five, reloads without `완료하기`, then reads the saved result. Wardrobe/relogin and full account backend/web restart flows cover persisted identities/state. `legacyAnswerJsonRestoresNullReward` covers older answer JSON. | Full restart test is the account/roster flow. Game-state restart proof is explicitly owned by teacher Task 4 and is not claimed complete here. |
| G07 | Browser failed first run advances to 5/150 including three wrong answers, keeps day 2 locked; successful replay changes pass/availability while `questions` first facts and journey position remain identical; day 3 stays date-locked. `JourneyIT` additionally covers first timeout, 150 first answers without final pass, 30 sessions/150 answers, server locks. | Browser does not accelerate through all thirty days; full-course distinction is an actual backend/API integration test. |
| G10 | Node-only canonical source is `backend/src/main/resources/content/hanbit-v1.json`; emitted student JS compared with 150 question texts and 150 explanations, zero matches. Tests do not import answers into browser/fixture code. | Teacher DTO/query privacy is still owned by the teacher plan. |
| G11 | Independent original renderer compared with shared product renderer across nine characters × base/five matching/two mixed outfits: 72 pairs, every RGBA channel identical; each product canvas has >1000 nontransparent pixels. Root visually inspected all nine paired rows. Catalog icon and worn art share the same fixed artwork; existing artwork/icon tests protect mapping and framing. | Original standing artwork only; CSS motion is not a new pose asset. |
| G12 | Browser selection → first learning/pass → saved gift → owned equip → relogin/closet; map first facts/locks; direct active session with null character; same original deadline after route and relogin. Held actual cosmetic GETs permit canonical answer completion and explicit next question. | Teacher overview/student/question drilldown remains required in the teacher plan. |
| G13 | Both 360px and 1280px, seven student surfaces measured at overflow 0 and min target width/height 48px; actual keyboard focus/Enter, visible ≥2px outline, reduced-motion `animation-name: none`; existing auth/learning/role-switch flows run in the full suite. | Responsive auth suite retains its original separate 320/390/768/1440 checks. Sanitized proof captures are element crops and can include the sticky student navigation when scrolled. |
| G14 | Full backend, frontend, build, lint, extraction tests and isolated full Chromium run; independent JUnit count and emitted-bundle audit below. | Final whole-branch review and teacher implementation are pending. |

## Browser artwork method and evidence paths

Reference file: `/Users/Joseph/Downloads/equipment-design-review.html`, overridable by `HANBIT_GEAR_REFERENCE`. The test extracts only audited original graphics lines 5–377, anchors 388–398 and the literal nine PNG `ART` declaration on line 399. It checks extraction boundaries, parses the image array as JSON, and never executes the original HTML shell, prototype learning logic, timers, questions, state or sample teacher rows.

The browser decodes each original image/layer before calling the original `renderEquippedAvatar`. The shared `renderAvatar` fixture awaits all draws. Each canvas is intrinsically 128 × 176. The comparison reads both `ImageData` arrays, counts nontransparent product pixels and requires zero channel differences. Original and product are therefore independent implementations with identical source artwork, not the same renderer compared to itself. The nine screenshot rows show product on the left and original on the right for all eight outfits.

Historical initial-run evidence directory: `.superpowers/sdd/2026-10-13-student-game-experience/art-evidence/` with `character-0-actual-reference.png` through `character-8-actual-reference.png`. Root reviewed all nine rows, including hat/hair boundaries, clothes, near/far shoes and restored hand/grip, and confirmed visible pairs match. These historical files are no longer hardcoded output targets. No authored walking/cheering/sad pose is claimed.

Sanitized synthetic result proof directory: `.superpowers/sdd/2026-10-13-student-game-experience/browser-evidence/`. Retained files: `result-360.png`, `result-1280.png` and `layout.jsonl`. The JSONL stores only route category, viewport, overflow, control count and minimum dimensions, with session IDs replaced by `SYNTHETIC`. Root visually reviewed all twelve redacted page images, confirming contained/readable home, map, closet, question, result and personal-list art at both widths. The ten non-result PNGs were then removed by exact filename; their capture calls are absent from the permanent harness. They are generated transient review material, not recoverable retained evidence. The remaining result images additionally hide the sticky navigation.

One screenshot after desktop-to-mobile resizing showed the map hero outside the cropped viewport. A separate read-only browser probe used an existing synthetic learner without new account/learning writes or screenshots. Fresh 360px entry and explicit recenter after 1280→360 resize both measured a 326×670 viewport and fully visible 72×99 hero, with center delta X=0 and Y=185 (the bottom of the map limits vertical centering near the starting position). Explicit recenter works; no additional product edit was made for intentional map panning/resizing.

| Surface | Targets observed | 360px overflow / minimum W×H | 1280px overflow / minimum W×H |
| --- | ---: | --- | --- |
| Character | 19 | 0 / 48×48 | 0 / 48×48 |
| Home | 47 | 0 / 48×48 | 0 / 48×48 |
| Map | 71 | 0 / 48×48 | 0 / 48×48 |
| Closet | 46 | 0 / 48×48 | 0 / 48×48 |
| Active question | 11 | 0 / 48×48 | 0 / 48×48 |
| Saved result | 12 | 0 / 48×48 | 0 / 48×48 |
| Personal question list | 14 | 0 / 48×48 | 0 / 48×48 |

Counts describe the sampled synthetic state; other learning states can have additional controls. The assertion covers every visible matched link/button/select wrapper, including the student travel navigation, and measures both dimensions.

## Final execution record

Toolchain: Java 21 at `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`; actual Node **v24.19.0** and pnpm **11.25.0** using `/Users/Joseph/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin` on PATH.

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./backend/gradlew -p backend test --rerun-tasks
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
node --test scripts/extract-game-assets.test.mjs
HANBIT_E2E_BASE_URL=http://127.0.0.1:8090 HANBIT_E2E_COMPOSE_PROJECT=hanbit-game-e2e HANBIT_GEAR_QA_URL=http://127.0.0.1:8091/e2e/fixtures/equipment-review.html pnpm --dir frontend test:e2e
```

Frontend: **221/221 tests in 28 files**, build and lint exit 0. Asset extraction: **2/2**, failures/cancelled/skipped/todo 0. Build emitted `index-CzOCCseF.js`, SHA-256 `f3bc73e81904dd759e461240ff72040f5f62c47f72a80593f3b49cf82a97ab76`. Canonical 150 questions × text/explanation = **300 strings**, **0 bundle matches**.

Backend: **576 tests / 33 JUnit suites / 0 failures / 0 errors / 0 skipped**, independently summed from every `backend/build/test-results/test/TEST-*.xml` suite header after Gradle completed (`BUILD SUCCESSFUL in 2m 39s`, all 4 tasks executed). The full Chromium suite initially passed **26/26** in 1.1 minutes. After narrowing screenshot retention to result-only, the final full Chromium rerun again passed **26/26 in 1.1 minutes, 0 failures/errors/skips**, including both real account restart sites and actual scheduled expiry. Lint was rerun after this harness-only change and passed. Both mode-600 env files were checked without reading values; standard Playwright output contains only `.last-run.json`, no retained DOM contexts/traces/videos/screenshots. Backend/product/frontend unit code was unchanged between these final browser runs.

## Decision ledger — all Ruling lines, including cost if wrong

Ruling: GameItem.assetKey is the canonical itemId (e.g. face-1), consistent with the shared equipmentArt(itemId) interface — spec fixes the item IDs but not a second artwork-key naming scheme; avoid duplicate mapping — cost if wrong: catalog/art-key consumers would need a compatible mapping correction, no learning facts affected.

Ruling: permit a minimal test-only synchronization correction for these two existing LearningSessionPage tests within Task3, in a separate task-unit commit, once the async race is confirmed — full regression gate is binding and test timing must observe canonical completion, not guessed elapsed time; keep all polling/no-write/no-advance/error/link/pending assertions and production code unchanged — cost if wrong: a weakened or incorrect wait could hide a learning polling regression; independent task/final reviewers must verify the original behavioral assertions remain intact.

Ruling: authorize one minimal test-only command-settlement wait in correctWrongAndTimeoutFeedbackUseServerResult before its unchanged immediate Next-enabled assertion — controlled held-request evidence proves the pre-existing required learning refresh boundary and separates it from cosmetic refresh, so observe the busy marker disappearing rather than assume feedback render means command completion — cost if wrong: an incorrect synchronization condition could conceal a pending-command regression; retain all enabled/server-result/once/pending assertions and have task/final reviewers inspect the new controlled boundary test.

Ruling: permit a dedicated credential-free test-only QA evidence router with opt-in run/plan-specific output, and retain unchanged e2e/helpers.ts account logic — existing relative-URL account helpers already honor the validated Playwright target, so the plan's undifferentiated file list does not justify a meaningless auth-helper edit; shared student/teacher regression must not write a completed predecessor SDD workspace — cost if wrong: test evidence routing/setup/documentation would need adjustment, but product authentication and learning facts remain unchanged.

These are all four lines containing `Ruling:` in the execution ledger. They remain the exhaustive decision record after the final student review. Its ignored process workspace is recoverably archived as described below; no ignored artifact is tracked.

## Review fix R1 — evidence lifecycle isolation

Review found that automatic output into the student plan's fixed SDD directory would recreate/overwrite predecessor scratch when teacher combined verification reruns shared tests. The dedicated `frontend/e2e/evidence-output.ts` router now leaves all pixel/layout/game assertions enabled while writing no evidence by default. It imports no account helper, auth env file, canonical answers or predecessor plan. Browser callers anchor paths to the module's current checkout, not caller-provided filesystem paths.

Optional capture requires both `HANBIT_E2E_EVIDENCE_PLAN` and `HANBIT_E2E_EVIDENCE_RUN`. Each must be a bounded lowercase alphanumeric/hyphen identifier. Absolute/traversal paths, partial/empty configuration and symlink ancestors/artifacts are rejected before any write. Output is `.superpowers/sdd/<plan>/evidence/<run>/`; the run directory is created exclusively and cannot be reused, so a new invocation cannot overwrite PNGs or append to old metrics. Only that configured plan's ancestors are inspected. Layout records still replace session IDs with `SYNTHETIC`; retained images remain art-only and sanitized result-only.

Teacher combined verification should either leave both capture variables unset or explicitly use its own plan and a new run:

```sh
HANBIT_E2E_EVIDENCE_PLAN=2026-10-13-teacher-learning-statistics HANBIT_E2E_EVIDENCE_RUN=combined-review-001 pnpm --dir frontend test:e2e
```

The existing validated loopback/project/art target variables must also be set as documented in README. A later command uses a new run name rather than reusing `combined-review-001`. This is an invocation example, not a teacher-phase execution or permission to read/write predecessor scratch.

R1 TDD: `node --test scripts/evidence-output.test.ts` against the stub yielded **1 passed / 4 expected assertion failures** (missing output and missing safety rejection); implemented router yielded **5 passed / 0 failed/skipped**, including actual filesystem separation, all five symlink ancestor positions and leaf protection. A macOS `/var`→`/private/var` canonical-root difference was corrected in the test fixture. Strict typecheck of changed helpers/specs/router/tests and frontend lint passed.

With both capture variables explicitly unset, the full actual Chromium suite passed **26/26 in 1.1 minutes, zero failures/errors/skips**, including art, all game and shared legacy learning cases. SHA-256 and mtimes of all twelve historical evidence files were unchanged. With capture enabled for this student plan and fresh run `task7-r1-capture-20261013-1`, actual art and first-pass/result cases passed **2/2 in 5.3s**. The new `.superpowers/sdd/2026-10-13-student-game-experience/evidence/task7-r1-capture-20261013-1/` contains exactly nine art PNGs, two sanitized result PNGs and one redacted layout JSONL; historical files again remained unchanged. No teacher SDD folder was read or written by these executions. No backend/product code changed in R1, so the prior backend/frontend-product gates were not repeated.

## Deferred findings for final-review triage

- Task 2 runtime output: JVM CDS warning and Spring shutdown INFO. Record separately from test failures; do not claim literal pristine output.
- Task 5 home game-read error recovery: resolved in the bounded final presentation fix below and independently re-reviewed as addressed.
- Task 5 Vitest jsdom environment performance hint remains informational output; the final reviewer found no product fix necessary.
- Browser runner emits `NO_COLOR`/`FORCE_COLOR` environment warning; no suppression or blanket pristine-output claim.
- Teacher G08/G09 and teacher portions of G10/G12/G13/G14, combined full regression and full game-state restart proof remain required. The student whole-branch review and its one bounded fix/re-review are now complete. No push, PR, merge, deployment or integration menu has been performed.

## Bounded final presentation fix — 2026-10-13

Fix base: `c70b0b8ec2a24d23cc6371eee182a45bcb217d77`. Product work units: `f643d1a` (home selection guide and read recovery) and `d4f86e6` (saved gift preview and result read recovery). This implements the three approved final-review presentation findings from spec sections 4/6/11; it does not complete the outstanding teacher plan or the root final review gate.

Home now visibly explains the nullable character selection and links to `/student/character`, alongside its canonical start/continue controls. Failed home game and journey reads expose independent GET retries. Saved results expose the same independent cosmetic-read recovery, and a gift lookup failure no longer claims indefinite loading. A labeled `선물 착용 미리보기` uses the saved character and a copied six-slot outfit with only the awarded slot replaced. The saved scene, query equipment, nullable character and XP stay canonical until the existing explicit `지금 착용하기` appearance PUT succeeds. No backend/auth/renderer/query-guard/learning-writer changes were made.

TDD RED: focused dashboard/result tests on the base implementation produced **39 passed / 9 expected failures** for absent selection guidance, cosmetic retry controls, and gift preview. A new actual-browser test against the previously built owned test web failed at the absent visible selection guide (**1 failed**, expected visible text not found). The supplemental command-independence cases characterize already-required learning behavior.

The new result recovery test initially observed the existing restored-lastAnswer boundary: its automatic game refresh cancels/replaces the initial read. It now observes two real API invocations and the affected account query's `status: error, fetchStatus: idle`, then clicks the current enabled retry button. That is a synchronization correction within the new test only. All old assertions, timings, owner/epoch, pending writer, deadline, first facts and XP assertions remain intact; the four Ruling lines above are unchanged.

Final commands used Node **v24.19.0** / pnpm **11.25.0** with `/Users/Joseph/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin` on PATH:

```sh
pnpm --dir frontend test src/features/learning/LearningDashboardPage.test.tsx src/features/learning/LearningResultPage.test.tsx src/features/game/LearningGameScene.test.tsx
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
pnpm --dir frontend exec tsc --project tsconfig.e2e.json --noEmit
HANBIT_E2E_BASE_URL=http://127.0.0.1:8090 HANBIT_E2E_COMPOSE_PROJECT=hanbit-game-e2e HANBIT_E2E_EVIDENCE_PLAN=2026-10-13-student-game-experience HANBIT_E2E_EVIDENCE_RUN=final-fix-20261013-1950 pnpm --dir frontend test:e2e e2e/game-flow.spec.ts --grep finalPresentationGuideRecoveryAndGiftPreview
HANBIT_E2E_BASE_URL=http://127.0.0.1:8090 HANBIT_E2E_COMPOSE_PROJECT=hanbit-game-e2e pnpm --dir frontend test:e2e e2e/game-flow.spec.ts
```

GREEN: focused dashboard/result/scene **61/61**, whole frontend **236/236 in 28 files** (previous count 221 + 15 new cases), build/lint/E2E typecheck exit 0. Build emitted `index-QdhdjeKi.js` and `index-F3_eAIFd.css`. Opt-in final presentation browser test **1/1 in 3.7s**, then all actual game-browser cases **9/9 in 21.0s** with evidence variables unset. These include existing appearance relogin, locks, first-pass/replay XP, revision conflict, nullable-character/deadline and held-real-response command independence cases. The full unit gate includes the unchanged prior-owner/unmount/account/epoch/monotonic-revision regressions. Vitest's jsdom performance hint and Playwright's `NO_COLOR`/`FORCE_COLOR` warning remain informational output; no literal pristine-output claim is made.

Before rebuilding, all three Compose service labels matched project `hanbit-game-e2e` and this worktree's `infra` working directory; `.env.e2e.local` mode was 600 without reading its values, and the existing backend was healthy. Only the owned web image was built and web recreated with `up -d --no-deps --force-recreate web`, followed by public readiness HTTP 200. Backend/database container IDs were unchanged (`37cfe0ed28e3` / `52419d668b75`); no backend/database/volume restart or recreation occurred. Vite art handle 1791 and default 8088/production were untouched. Test account data was provisioned through the unchanged credential helper and normal UI/API; cosmetic fault injection first fetched the actual HTTP 200 response, then aborted delivery, never synthesized a game snapshot.

The new browser case checks GET-only home/result retries, real normally-earned face-1 preview pixels differing from the saved unequipped scene, no appearance PUT before the explicit click, unchanged saved nullable character/equipment/XP before that click, and one successful PUT with the complete six-slot outfit afterward. It measures home guide, home error, result preview and result error states at **360px and 1280px**: all **overflow 0**, every matched target at least **48 × 48px**. Counts by sampled state are **48 / 50 / 12 / 13**. Sanitized result images at both widths were visually inspected: portrait, preview explanation, actual gift art and save action remain contained and readable, with stacked mobile and side-by-side desktop preview. New evidence only: `.superpowers/sdd/2026-10-13-student-game-experience/evidence/final-fix-20261013-1950/{result-360.png,result-1280.png,layout.jsonl}`. No other plan's SDD path was read or written, and automatic screenshots/traces/video remain off.

Self-review: changed pages preserve the existing hook order, accessible Korean guide/retry/preview labels, independent query enable/disable states, six-slot null preservation and explicit appearance writer. The gift outfit is a render-local object; GameAvatar tracks primitive slot values and aborts render on departure. Existing `useAppearance` ownership/revision/epoch checks and monotonic query publication are untouched. No old test assertion was removed or weakened. Scope ends with the three presentation fixes and their evidence; the root's one scoped re-review and teacher four-task implementation remain pending.

## Student final gate and teacher handoff

The most-capable whole-branch review examined the recorded branch baseline `cd7d8cef9cc4d7221276f682625781a8ff0ec2b0` through `c70b0b8`. Local `main` is stale; the recorded baseline equals `origin/main` and is an ancestor of this feature branch. The review found two Important presentation gaps and one Minor preview omission. One bounded fix wave (`f643d1a`, `d4f86e6`, `296dd3d`) addressed all three. Its independent scoped re-review confirmed every finding **ADDRESSED**, with no new breakage or residual findings. No second fix wave or parked finding was used. Runtime output disclosures were triaged as informational, and all four rulings were accepted.

Current student product evidence: **236 frontend tests**, build/lint/E2E typecheck passed, **9 game Chromium cases** passed after the final presentation changes. The earlier whole Chromium gate was **26/26** before this one new browser case; the teacher combined gate must run the new complete suite rather than claim that historical count as a fresh result. Backend remains unchanged since the independently summed **576 tests / 33 suites / zero failures, errors or skips**. The root independently checked the final emitted `index-QdhdjeKi.js`: SHA-256 `992fbfc01accc268383d30496374f8285a14fc6eb378e789300f3fcc3331f02a`, **150 questions / 300 raw and JSON-escaped text/explanation strings / zero matches**. All four full ruling lines remain verbatim. Root also viewed both final sanitized result images and verified the saved scene versus clearly labeled local preview at both widths.

Only this completed plan's ignored process directory is moved recoverably to `.superpowers/archive/2026-10-13-student-game-experience-296dd3d/`, preserving its reports, packages and authorized art/result evidence. Earlier `.superpowers/sdd/2026-10-13-student-game-experience/...` evidence paths above describe the original execution locations; their corresponding files are now beneath that archive. No sibling plan directory is changed. The reusable E2E router writes nothing by default; any teacher capture must use the teacher plan's own fresh run and must not read or write predecessor scratch.

Continue the approved `docs/superpowers/plans/2026-10-13-teacher-learning-statistics.md` in the same branch/worktree, with its own ledger and four task gates. Outstanding combined proof includes actual school-scoped statistics/privacy and **avatar, gear, saved gift, map and learning history after supported backend restarts**. Current account/roster restart evidence does not substitute for that proof. The overall implementation goal is not complete at this student handoff, and no integration or production action is authorized by this record.
