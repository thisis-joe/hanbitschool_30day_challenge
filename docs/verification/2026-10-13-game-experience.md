# Student game experience verification — 2026-10-13

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

These are all four lines containing `Ruling:` in the execution ledger at the time of this record. The ignored execution scratch is retained for review and has not been force-added or removed.

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
- Task 5 home game-read error recovery: loading fallback lacks an explicit error/retry at the reported dashboard boundary. Final reviewer must triage; Task 7 has not silently resolved or pre-judged it.
- Task 5 Vitest jsdom environment performance hint remains informational output; final reviewer must triage.
- Browser runner emits `NO_COLOR`/`FORCE_COLOR` environment warning; no suppression or blanket pristine-output claim.
- Teacher G08/G09 and teacher portions of G10/G12/G13/G14, final game/whole-branch review and combined regression are outstanding work in the parent plan. No push, PR, merge, deployment, integration menu or scratch removal has been performed.
