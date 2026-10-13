# 학생 학습 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 로그인 후 실제 O/X 풀이·해설·결과·재개·재도전·개인 문제 목록을 사용할 수 있게 하고, 검증된 소스를 기존 HTTPS 링크에 재배포한다.

**Architecture:** 기존 React Router/TanStack Query와 세션·CSRF HTTP 경계를 사용해 `features/learning`을 추가한다. 학생별 조회와 대기 명령, 서버 Date 기반 시계가 페이지의 안전한 복구를 지원하며 학습 사실은 기존 Java API에서만 확정한다. 네 구현 task의 독립 리뷰와 전체 branch review 후 기존 Compose/Cloudflare 운영 경로로 배포한다.

**Tech Stack:** React 19.3.0, TypeScript 6.0.3, Vite 8.3.4, React Router 7.18.4, TanStack Query 5.104.2, Vitest 5.0.3, MSW 3.0.3, Playwright 1.64.0, Node 24, pnpm 11.25.0. 기존 Java 21/Spring Boot 4.1.1/PostgreSQL 17/Flyway API.

**Spec:** [학생 학습 UI 설계](../specs/2026-10-13-student-learning-ui-design.md), 기존 [학습 코어 설계](../specs/2026-10-12-learning-core-design.md).

## Global Constraints

- 기능 브랜치는 `feat/student-learning-ui`, 작업 단위 커밋을 분리한다.
- 모든 새 화면은 STUDENT 보호 경로다. 교직원의 기본 화면과 비밀번호 변경 강제 흐름은 유지한다.
- 학습·XP·진행 규칙은 승인된 학습 코어 설계와 기존 Java API를 그대로 따른다. 운영 schema migration은 추가하지 않는다.
- O는 사실, X는 해석이다. 서버 정답·해설 데이터나 questions.json을 프런트엔드에 복사하지 않는다.
- 답변·통과·XP를 클라이언트에서 낙관적으로 확정하지 않는다. 반복 1 XP, 밀림 최종 지급액 -1 XP, 3/5 통과, 5번째 자동 저장, 수동 큐 유지·monotonic mastery를 보존한다.
- 불확실한 start/answer/advance의 최소 명령 정보는 학생 ID 범위의 sessionStorage에 보관하여 새로고침 후 복구한다. 비밀번호·정답·해설·남은 시간·XP 사실은 영속 클라이언트 저장소에 저장하지 않는다.
- REVIEW의 dayNumber, attemptState, dayState는 null일 수 있다. 전체 시도의 XP 합계·개별 결과 배열·개인 목록 첫 outcome/정답/해설/큐 reason을 임의로 추정해 표시하지 않는다.
- 제한시간은 저장된 deadlineAt을 기준으로 표시하고 서버 HTTP Date와 단조 시계로 기기 시계 변경 영향을 줄인다. 카운트다운은 안내이며 판정은 서버가 한다.
- status/session/private GET은 query 취소 신호를 전달하고, 모든 쓰기는 기존 세션 쿠키·CSRF helper를 통한다. 학생 ID를 API 요청 본문에 추가하지 않는다.
- 개인정보는 학생별 query key·취소 신호와 기존 계정 전환/401 cache clearing으로 격리한다.
- 모바일 360px와 데스크톱에서 가로 스크롤 없이 사용한다. 48px 이상 터치 대상, 보이는 focus, 키보드 조작, 색상 이외 판정 문구, reduced motion을 제공한다. 매초 카운트다운을 live announcement로 읽지 않는다.
- 새 UI 의존성은 추가하지 않는다. 기존 크림/초록/노랑 토큰과 스타일을 재사용한다.
- 보상 아이템·아바타·장비·지도·랭킹·연속일·교사 학습 통계 UI는 포함하지 않는다.
- 테스트용 자격 증명은 ignored E2E 환경과 메모리에만 두고 일반 로그·trace·영상·스크린샷에 남기지 않는다. 사용자 기존 운영 계정·학습 결과는 변경하지 않는다.

## Review Focus

1. 답변 서버 commit 후 네트워크 응답 유실·새로고침: 동일 UUID/payload의 명시적 재시도와 현재 GET 복원, 중복 선택/XP 없음 — Task 1 `lostResponseRetryKeepsTheSamePayloadAndRequestId`, Task 2 `reloadRestoresAnUncertainAnswerWithoutOfferingAnotherChoice`.
2. logout/학생 전환 뒤 늦은 조회·mutation 완료: 이전 학생 데이터/이동/대기 명령이 새 계정에 섞이지 않음 — Task 1 `accountChangeAbortsReadsAndIgnoresLateMutationCompletion`, Task 3 `switchingStudentsDoesNotRenderPreviousLearningData`.
3. 마감 직전 클라이언트 시계 변경·숨긴 탭 복귀·worker 지연: 동일 deadline, 서버 확정 전 timeout 사실/advance 생성 없음 — Task 1 `serverDateAndMonotonicTimeIgnoreWallClockChanges`, Task 2 `zeroCountdownWaitsForTheServerAndNeverAdvances`.
4. COMPLETED지만 result 확인 전 종료, 이미 PASSED인 REPLAY 실패, REVIEW 일부 오답: 완료의 세 의미를 혼동하지 않고 저장 결과 복원 — Task 2 `completedSessionRestoresWithoutAFinishMutation`, `passedReplayNeverDisplaysRevokedProgress`, `reviewCompletionDoesNotClaimEveryQuestionIsMastered`.
5. 큐에 없는 mastered/bookmarked 선택, 다른 활성 세션, 저장소 차단/변조: 불가능한 REVIEW/새 시도와 백지 화면을 만들지 않고 복구 — Task 1 `blockedOrCorruptStorageFallsBackSafely`, Task 3 `reviewSelectionIncludesOnlyActiveQueuedQuestions`, `activeSessionBlocksStartingAnotherTarget`.

---

## 파일 책임과 인터페이스

| 파일/영역 | 책임 |
| --- | --- |
| `frontend/src/features/learning/types.ts`, `api.ts` | 서버 DTO·명령 타입 및 실제 세션/CSRF HTTP |
| `serverClock.ts`, `useDeadlineCountdown.ts` | HTTP Date/monotonic 시각 추정 및 absolute deadline 표시 |
| `pendingCommands.ts`, `useLearningActions.ts` | 학생별 고정 논리 명령, synchronous submission lock, 불확실한 쓰기 재시도·재조회 |
| `queries.ts` | 학생별 status/session/개인 목록 query와 AbortSignal |
| `LearningSessionPage.tsx`, `LearningResultPage.tsx`, `learning.css` | 문제/확정 해설/완료 결과와 학습 스타일 |
| `LearningDashboardPage.tsx`, `PersonalQuestionsPage.tsx`, `QuestionFeedbackActions.tsx` | 학습 행동표, 회차, 개인 목록·별표·수동 큐 |
| 기존 auth/App/router | 학생 landing·내 정보·보호 경로·auth cache/pending cleanup |
| `frontend/src/test/learningFixtures.ts` | 전체 DTO 구조를 갖춘 테스트 전용 fixture |
| `frontend/e2e/learning-flow.spec.ts`, 기존 E2E helpers | 실제 PostgreSQL/브라우저 흐름 |
| README/`docs/verification/2026-10-13-student-learning-ui.md` | 현재 UI 범위와 실행 검증/배포 근거 |

서버의 정확한 필드명은 `backend/src/main/java/kr/hanbit/school/learning/{LearningStatus,LearningSessionView,QuestionPrompt,AnswerResult,PersonalQuestionView,*Command}.java`다. API의 body/response는 이 타입과 일치시킨다. session 질문의 `position`은 세션 내 순서다.

기존 공용 `request<T>(path, init)`에 선택적 세 번째 인자 `onResponse?: (response: Response) => void`를 추가한다. 호출 시각 관찰만 제공하며 기존 반환·CSRF·401·204 동작은 바꾸지 않는다. 학습 API만 Date 관찰자를 전달한다.

대기 명령은 `PendingLearningCommand = {kind:'START',command:StartLearningSessionCommand} | {kind:'ANSWER',sessionId:string,command:SubmitAnswerCommand} | {kind:'ADVANCE',sessionId:string,command:AdvanceLearningSessionCommand}`이다. command 안에는 서버 필드만 있다. 학생 scope는 저장 key와 hook에서 관리하고 body에 보내지 않는다.

### Task 1: typed API·서버 시각·대기 명령·학생별 query

**Files:**
- Create: `frontend/src/features/learning/{types,api,serverClock,pendingCommands,queries,useLearningActions}.ts`.
- Create: `frontend/src/features/learning/useDeadlineCountdown.ts`.
- Modify: `frontend/src/lib/http.ts`, `frontend/src/features/auth/queries.ts`, `frontend/src/app/App.tsx` (auth cleanup만; 새 메뉴는 Task 3).
- Test support: `frontend/src/test/learningFixtures.ts`.
- Test: `frontend/src/features/learning/{api,serverClock,pendingCommands,useLearningActions}.test.ts` 또는 hook 렌더링 파일은 `.test.tsx`; `frontend/src/lib/http.test.ts`, `frontend/src/features/auth/AuthSession.test.tsx`.

**Interfaces:**
- Produces 서버와 동일한 LearningStatus/LearningSessionView/QuestionPrompt/AnswerResult/PersonalQuestionView 및 enum union, StartLearningSessionCommand/SubmitAnswerCommand/AdvanceLearningSessionCommand; `StartTarget = Omit<StartLearningSessionCommand,'requestId'>`.
- Produces `getLearningStatus(signal?)`, `getLearningSession(sessionId,signal?)`, `getPersonalQuestions(filter,signal?)`; 각각 typed Promise. `startLearningSession(command,signal?)`, `submitLearningAnswer(sessionId,command,signal?)`, `advanceLearningSession(sessionId,command,signal?)`; `addReviewQueue(questionId,signal?)`, `removeReviewQueue(questionId,signal?)`, `addBookmark(questionId,signal?)`, `removeBookmark(questionId,signal?)`는 기존 request로 204를 처리한다.
- Produces `ServerClock` with optional constructor clocks `(monotonicNow = performance.now, wallNow = Date.now)`, `observeHttpDate(value:string|null):void`, `now():number`; shared `learningClock`. HTTP Date는 초 정밀도의 표시용 추정이며 invalid/missing header는 기존 monotonic anchor를 버리지 않는다. server sample 전에 wall clock을 한 번 anchor로 쓰고 이후 변경을 따라가지 않는다.
- Produces `useDeadlineCountdown(deadlineAt:string,timeLimitSeconds:number): {seconds:number,expired:boolean}`; ceil 남은 초를 0~timeLimitSeconds에 clamp하고 250ms 표시 갱신한다. state 변경은 서버 API를 호출하지 않는다.
- Produces `PendingLearningCommand = {kind:'START',command:StartLearningSessionCommand} | {kind:'ANSWER',sessionId:string,command:SubmitAnswerCommand} | {kind:'ADVANCE',sessionId:string,command:AdvanceLearningSessionCommand}`; `readPendingCommand(accountId): PendingLearningCommand|null`, `writePendingCommand(accountId,command):void`, `clearPendingCommand(accountId):void`, `clearAllPendingCommands():void`. key prefix는 `hanbit.learning.pending.v1:`. request/session UUID·문항 ID·모드별 body를 검사한다. accountId는 동일성으로 scope를 분리하는 opaque string이다. 손상·차단 storage는 안전한 in-memory fallback/GET 복구로 처리한다.
- Produces `learningKeys.status(accountId)`, `.session(accountId,sessionId)`, `.questions(accountId,filter)` and hooks `useLearningStatus()`, `useLearningSession(sessionId)`, `usePersonalQuestions(filter)`; 기존 useCurrentAccount의 STUDENT일 때만 enabled, 모든 GET에 signal 전달.
- Produces `useLearningActions()` returning `busy:boolean`, `error:string|undefined`, `pendingCommand:PendingLearningCommand|null`, `start(target):Promise<LearningSessionView|null>`, `answer(sessionId,questionId,choice):Promise<AnswerResult|null>`, `advance(sessionId):Promise<LearningSessionView|null>`, `retryPending():Promise<LearningOperationResponse|null>`. response is `{kind:'START'|'ADVANCE',view:LearningSessionView} | {kind:'ANSWER',sessionId:string,answer:AnswerResult}`.
- 성공은 새 canonical session GET과 관련 status/list invalidation을 거친다. 응답 유실·INVALID_CSRF_TOKEN에는 대기 ID를 유지한다. account epoch/AbortController로 이전 학생 완료를 무시하며 `null`은 중복/이탈된 호출의 무효 결과다. 현재 미해결 명령을 다른 choice/target으로 덮어쓰지 않는다.

- [ ] **Step 1: Write behavioral RED tests.** `apiUsesStudentPathsCsrfAndAbortSignals`는 실제 request/MSW 경계의 URL/body/CSRF/204/Date를 확인한다. `lostResponseRetryKeepsTheSamePayloadAndRequestId`는 첫 POST를 server-committed/response-error로 만들고 retry body·UUID가 동일하며 GET 결과를 복원함을 확인한다. `fastDoubleClickSubmitsOnlyOneLogicalAnswer`와 `accountChangeAbortsReadsAndIgnoresLateMutationCompletion`은 실제 hook·query cache로 검증한다. storage tests는 다른 학생 key 접근, 잘못된 UUID/shape, SecurityError/QuotaExceededError를 포함한다. clock 테스트는 literal deadline과 주입 clock으로 wall clock 점프에도 남은 시간이 새로 지급되지 않음을 확인한다.
- [ ] **Step 2: Run RED.** `npx --yes --package=node@24 --package=pnpm@11.25.0 -c 'pnpm --dir frontend exec vitest run src/features/learning src/lib/http.test.ts src/features/auth/AuthSession.test.tsx'`. 신규 behavior 결손을 확인하며 syntax/import 오타를 RED로 주장하지 않는다.
- [ ] **Step 3: Implement the stated foundation.** 작은 책임별 파일로 구현하고 성공/불확실성/명백한 4xx/계정 이탈을 구분한다. 명확히 확정된 conflict는 canonical GET으로 복구하고 무한 재시도를 하지 않는다. 로그인/logout/401에서 학습 대기 상태를 정리하되 늦은 promise가 다시 저장하지 못하게 한다.
- [ ] **Step 4: Verify GREEN and full frontend.** Step 2 재실행 후 `npx --yes --package=node@24 --package=pnpm@11.25.0 -c 'pnpm --dir frontend test && pnpm --dir frontend build && pnpm --dir frontend lint'`. 기존 30개와 신규 behavioral tests 모두 PASS, build/lint exit 0.
- [ ] **Step 5: Commit.** `feat: add resilient student learning client`.

### Task 2: 문제·확정 해설·재개·완료 결과 화면

**Files:**
- Create: `frontend/src/features/learning/{LearningSessionPage,LearningResultPage}.tsx`, `learning.css`.
- Test: `frontend/src/features/learning/{LearningSessionPage,LearningResultPage}.test.tsx`.

**Interfaces:**
- Consumes Task 1 타입/hooks/actions/countdown. Produces exported `LearningSessionPage()` and `LearningResultPage()` using `useParams<{sessionId:string}>`, relative routes from the spec. Tests render the real pages inside Router/QueryClient and MSW, not mocked hooks.
- QUESTION_ACTIVE renders fixed choices `O · 사실`/`X · 해석`; AWAITING_ADVANCE renders feedback and `다음 문제`; COMPLETED renders final feedback and `완료하기` Link to the result URL. Task 3 later adds the feedback tool component without redesigning the session flow.
- At expired display: `서버에서 답변을 확인하고 있어요`, refresh GET every 1000ms while still active. Do not locally force TIMED_OUT or create an advance. focus/visibility/online listeners trigger canonical re-read; cleanup on unmount/account change.
- Pending answer blocks a different selection and offers `같은 답변 다시 확인`; pending advance/start similarly retries the exact operation. Restore on reload without silently replacing a stored command. User navigation away states `현재 문항의 제한시간은 계속 흘러요`.
- Error reconciliation: already-finalized/question-mismatch GET; session conflict GET/status with active-session recovery link; 404 safe home link; version/key-reuse explicit reload/home recovery. Display errors rather than swallow failed reconciliation.
- Result branches use mode+attemptState+dayState; a passed-day REPLAY with RETRY_REQUIRED attempt is `재학습 완료`, not revoked pass. REVIEW says `복습 풀이를 마쳤어요`. Counts, totalXp and level only; no invented attempt-XP or five-row answer history.

- [ ] **Step 1: Write RED page tests.** Cover `activeQuestionDoesNotRevealAnswerOrExplanation`, `correctWrongAndTimeoutFeedbackUseServerResult`, `zeroCountdownWaitsForTheServerAndNeverAdvances`, `reloadRestoresAnUncertainAnswerWithoutOfferingAnotherChoice`, `resumeKeepsTheOriginalDeadlineInQuestionAndFeedback`, and late GET canonical reconciliation. Use full fixtures and real page events.
- [ ] **Step 2: Write RED result tests.** `completedSessionRestoresWithoutAFinishMutation` asserts reload renders correct count/XP and the `완료하기` Link never writes. `passedReplayNeverDisplaysRevokedProgress`, `reviewCompletionDoesNotClaimEveryQuestionIsMastered`, and `unfinishedResultRedirectsToCurrentSession` pin distinct completion semantics. Next-action tests use fresh status and forbid date-cap bypass.
- [ ] **Step 3: Run RED.** Pinned `pnpm --dir frontend exec vitest run src/features/learning/LearningSessionPage.test.tsx src/features/learning/LearningResultPage.test.tsx`.
- [ ] **Step 4: Implement session/result and focused styles.** Match current palette, a readable ~720px question area, readable full source strings, progress/timer, accessible focus transitions and status beyond color. Make answer/advance loading and retry states explicit. Pages remain independently renderable until Task 3 registers production routes; no placeholder routes are added.
- [ ] **Step 5: Verify GREEN and frontend regression.** Repeat Step 3, then full pinned test/build/lint. Read React best-practices guidance for the edited TSX; keep hooks unconditional and effect dependencies complete.
- [ ] **Step 6: Commit.** `feat: add student question and result screens`.

### Task 3: 학습 홈·개인 목록·동의·학생 로그인 연결

**Files:**
- Create: `frontend/src/features/learning/{LearningDashboardPage,PersonalQuestionsPage,QuestionFeedbackActions}.tsx`.
- Modify: `frontend/src/features/learning/{LearningSessionPage,LearningResultPage}.tsx`, `learning.css`; `frontend/src/app/{App,router,RequireRole}.tsx`, `frontend/src/features/auth/{queries.ts,StudentLoginPage.tsx,StudentAccountPage.tsx}`.
- Test: `frontend/src/features/learning/{LearningDashboardPage,PersonalQuestionsPage,QuestionFeedbackActions}.test.tsx`, existing App/RequireRole/StudentLoginPage/AuthSession tests.
- Modify: `frontend/e2e/helpers.ts`, `role-switch.spec.ts` and existing student account landing assertions as needed; behavioral expectations follow the new learning home and keep explicit account navigation.

**Interfaces:**
- Produces exported `LearningDashboardPage()`, `PersonalQuestionsPage()`, `QuestionFeedbackActions({questionId:number,result:AnswerResult|null})` using Task 1 hooks/API.
- Register the four spec learning routes under existing STUDENT RequireRole. `accountPath(student)` and direct login success use `/student/learning`. Guard may preserve a validated internal student returnTo for expired-session deep-link/result re-login; default login remains learning home. Never accept external/protocol-relative returnTo.
- Home nextAction maps to wait/continue/FIRST/REPLAY/complete; `day <= passedDayCount` is passed under the fixed sequential course. Later unpassed is sequence-locked; `day > calendarCap` is date-locked. Active session prevents new targets and links to its real session ID.
- Private filters are URL-backed, labels `다시 볼 문제`, `복습 완료`, `별표한 문제`. Selection REVIEW uses only inReviewQueue rows in stable visible day/position order. Star PUT/DELETE and queue DELETE await server confirmation then re-fetch lists; no automatic USER queue clearing.
- Feedback tools query current personal state, display independent `aria-pressed` star, and show `다시 볼 문제로 추가할까요?` only for result.reviewPromptEligible. `추가하기` alone sends PUT; `지금은 괜찮아요` has no server mutation. Successful registration refreshes lists and hides the prompt for that feedback.

- [ ] **Step 1: Write RED home/navigation tests.** Pin six nextAction cases, 30 day cards/locked states, resume actual session, `activeSessionBlocksStartingAnotherTarget`, login/home/logo/password landing, protected-route denial and deep-link returnTo validation. Existing account page remains reachable via `내 정보`.
- [ ] **Step 2: Write RED list/consent/privacy tests.** Pin all three filters, empty/error/loading states, independent star confirmation, explicit queue removal, `reviewSelectionIncludesOnlyActiveQueuedQuestions`, active conflict recovery, `reviewPromptOnlyAddsAfterConsent`, USER state remaining after server correct response, and `switchingStudentsDoesNotRenderPreviousLearningData` with delayed responses/pending storage.
- [ ] **Step 3: Run RED.** Pinned `pnpm --dir frontend exec vitest run src/features/learning src/app src/features/auth`.
- [ ] **Step 4: Implement connected home/lists/navigation/tools.** Use fresh status for result's next action, expose safe retry/continue links, don't infer unsupported outcome/reason/explanation fields. Import learning.css once with production routing. Keep menus and cards responsive at 360px with 48px controls and explicit focus styles.
- [ ] **Step 5: Verify GREEN and full frontend.** Repeat Step 3 then pinned test/build/lint. No route-dependent warnings/unhandled request or React warnings may be silently ignored.
- [ ] **Step 6: Commit.** `feat: connect student learning home and personal questions`.

### Task 4: 실제 브라우저·PostgreSQL 검증과 실행 인계

**Files:**
- Create: `frontend/e2e/learning-flow.spec.ts`.
- Modify: `frontend/e2e/helpers.ts` and `playwright.config.ts` only if the existing harness needs a concrete learning-flow capability; keep credentials/artifact protections.
- Modify: `README.md`.
- Create: `docs/verification/2026-10-13-student-learning-ui.md`.
- Ignored runtime configuration: `.env.e2e.local` with generated test-only values; no production secrets copied.

**Interfaces:**
- Real E2E uses existing admin→teacher→classroom→student flow in separate `hanbit-account-e2e` Compose DB at `http://localhost:8088`. Extend provisionClass with an optional startDate so learning tests can use server Seoul today minus one day for two available days. All credentials stay in helpers/memory, no trace/video/screenshots of entry/results.
- Test-side canonical answers may be read from backend content solely in the Node E2E fixture; they are never bundled into learner code. Requests/responses may be captured as assertions without credential payload logging.
- Deployment follows the existing `hanbit-prod`, `.env.prod.local`, `infra/compose.prod.yml`, volume/tunnel. Controller owns the user-authorized deployment after all task reviews and the whole-branch review; implementer does not deploy while writing tests.

- [ ] **Step 1: Add real learning E2E cases.** `studentCanPassFiveQuestionsAndRestoreTheSavedResult` covers login landing, FIRST/feedback/advance, fifth save without a `완료하기` POST, reload and re-login result. `failedDayReplayPassKeepsFirstFactsAndPaysOneXpPerRepeat` covers 2/5 failure and 3+ retry. `questionAndFeedbackResumeKeepTheSameServerDeadline` covers reload in both phases and second login. `expiredQuestionRestoresServerTimeout` waits on real worker result without sleep-based fake answers. `privateQueueBookmarkAndConsentRemainIndependent` covers AUTO, correct mastery, later wrong prompt, consent and persistent USER/star. Assert relevant server responses and DB-derived behavior through API, not browser-only fake state.
- [ ] **Step 2: Provision isolated runtime and run focused E2E.** Generate ignored test env; `docker compose -p hanbit-account-e2e --env-file .env.e2e.local -f infra/compose.local.yml up --build -d --wait`. Pinned `pnpm --dir frontend exec playwright test e2e/learning-flow.spec.ts` must execute real Chromium/PostgreSQL cases with no skipped required cases. If runtime setup fails, diagnose it separately from product RED.
- [ ] **Step 3: Run complete verification.** `./backend/gradlew -p backend clean test`; pinned frontend test/build/lint; pinned `pnpm --dir frontend test:e2e`. All current account/staff/frontend regressions and learning E2E pass. Do not change global Node or weaken production cookie defaults.
- [ ] **Step 4: Record actual evidence and U01~U18 mapping.** README describes actual new student UI and excludes unchanged game/teacher features. Verification record names tests, exact commands/results/counts, runtime version, branch commits and scope. Do not claim deployment before it happens. Publish-ready code status and pending deployment protocol are distinct.
- [ ] **Step 5: Commit.** `test: verify student learning ui end to end`.

## 최종 리뷰와 같은 링크 재배포

모든 task의 독립 리뷰 통과 후 branch 시작점 `027b4ec`부터 HEAD까지 가장 강한 reviewer에게 full diff package를 넘긴다. Critical/Important는 수정·scoped re-review 후 배포할 소스를 확정한다. 이미 통과한 동일 소스의 대규모 suite를 이유 없이 반복하지 않으며, 수정 범위에는 필요한 새 검증을 수행한다.

Controller는 확정 HEAD에서 backend/web을 build하고 기존 DB를 backup하여 `hanbit-prod`를 `up --no-build -d --wait`로 교체한다. volume 삭제·migration repair·사용자 기존 행 변경을 하지 않는다. 외부 HTTPS login/signup/staff/API/asset과 브라우저의 학생 학습 화면을 확인하고, 합성 검증용 학생이 필요하면 승인 설계 범위에서 사용한다. 운영 데이터·자격 증명을 출력하지 않는다.

Task 4 implementer에게 실측 배포 결과를 전달하여 같은 검증 문서에 append/작업 단위 commit하게 한다. docs-only diff를 한 번 scoped review한다. 코드 변경이 필요하면 해당 구현 task로 돌아가 검증·리뷰 후 재배포한다. 마지막으로 ledger의 rulings를 보존/보고하고 이 plan의 ignored SDD scratch만 복구 가능하게 정리한다. 기존 tunnel bind가 workspace를 사용하므로 feature branch와 worktree를 보존한다.

## 자체 점검과 완료 조건

- U01~U03: Task 3, U04~U13: Tasks 1·2·3, U14~U15: Task 3, U16: Tasks 1·3, U17: Tasks 2·3·4, U18: Task 4와 최종 리뷰 후 배포 절차.
- foundation→screen→connected app은 실제 API 경계/페이지/내비게이션을 각각 독립 승인·거절할 수 있는 단위다. Task 4는 실제 E2E와 실행 문서의 gate다.
- StartTarget/command/result/query signature는 task 간 동일한 이름과 nullability를 사용한다. 스타일은 learning.css에 모으고 무관한 auth/staff 스타일을 변경하지 않는다.
- Review Focus 다섯 조건은 named test에 배정했다. API에 없는 집계/해설, 게임 기능, client timeout 판정을 도입하지 않는다.
- 완료는 U01~U18 증거, 독립 task/full review, 적절한 전체 검증, 같은 HTTPS 링크의 동작이 모두 갖춰졌을 때만 선언한다. 설계/계획 작성이나 단위 테스트만으로 완료하지 않는다.
