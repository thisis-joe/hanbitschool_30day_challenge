# Teacher Learning Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 교사가 같은 학교 학급의 학생 현황·첫 답변·별도 복습 개선·문항 분석을 조회하고 전체 게임 경험과 함께 검증한다.

**Architecture:** 별도 직원 read-only 모듈이 class/school authorization 후 first_answers·day_progress·review_masteries를 각각 읽고 집계한다. 기존 학급 페이지에서 진입하고 학생 게임 계획의 공용 캐릭터 renderer를 사용한다. 첫 답변 통계와 개인 큐·최신 답변은 분리한다.

**Tech Stack:** 기존 Java 21 / Spring Boot / JDBC·JPA / PostgreSQL 17, React·TypeScript·TanStack Query, JUnit/Testcontainers / Vitest/MSW / Playwright Chromium; 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-10-13-game-experience-design.md` (written spec 승인 완료). 선행 `2026-10-13-student-game-experience.md`의 실제 완료 코드 인터페이스를 소비하며, 선행 계획의 scratch/ledger를 읽거나 고치지 않는다. 두 계획 전체가 하나의 사용자 목표다.

## Global Constraints

- 작업은 현재 `feat/student-game-ui`와 `/Users/Joseph/.codex/worktrees/student-game-ui-design/hanbitschool_30day_challenge`를 유지한다.
- 학생의 첫 답변은 불변이며 반복 답변·최근 결과와 구분한다. 재학습 오답으로 기존 통과·복습 완료를 되돌리지 않는다.
- 기존 `learning-v1` XP 정책과 3,750 XP당 레벨을 그대로 사용한다. 반복 답변은 1 XP, 밀린 첫 학습은 해당 문항의 당일 최종 지급액보다 1 XP 적다. 최초 통과 XP는 기존 1,125/1,124 규칙이다.
- 교사와 관리자는 소속 학교 전체를 읽을 수 있으나 다른 학교·학생·불일치 학급의 상세를 읽을 수 없다. 비밀번호 변경 요구가 있는 직원은 기존대로 업무 조회를 제한한다.
- first_answers, day_progress, review_masteries와 콘텐츠를 각각 집계해 결합한다. last_answers·private_bookmarks·review_queue_entries는 교사 통계에 사용하지 않는다.
- reviewedWrong은 첫 오답/timeout 문항과 불변 review_masteries의 교집합이다. 별도 복습 개선 지표이며 첫 정답·오답 통계를 바꾸지 않는다. pendingWrong = wrong − reviewedWrong은 통계상 미개선 수이며 학생의 개인 큐 수가 아니다.
- 집계 요약은 선택 학급 전체이고 검색·목록 필터로 분모가 바뀌지 않는다. 기본 학생 페이지 크기는 20, 문항 분석은 10, 학생 상세 문항은 8이다.
- 학생 정렬은 NUMBER, PROGRESS_ASC, PENDING_WRONG_DESC, 동률은 번호·accountId 오름차순. 문항 정렬은 QUESTION_ASC, WRONG_RATE_DESC, TIMEOUT_DESC, 동률은 문항 ID 오름차순, null 오답률은 마지막이다.
- 페이지는 0부터, size는 1~50, 회차는 0 또는 1~30만 허용하며 불명 필터/정렬은 400이다.
- 학생의 사전 정답·해설을 번들에 하드코딩하지 않는다. 교사용 정답은 직원 인증 API에서만 읽는다. 개인 별표·다시 볼 문제·큐 reason·비밀번호·학급 가입 코드는 통계 DTO에 넣지 않는다.
- 360px와 데스크톱에서 학습/꾸미기/통계 body overflow가 없고 주요 터치 대상은 48px 이상이어야 한다.
- 실행은 별도 테스트 DB·합성 계정과 현재 격리된 기능 브랜치·워크트리에서만 한다. 운영 자격 증명·기존 검증 계정·실제 학생 결과를 사용하거나 변경하지 않는다.
- 새 XP/해금 정책·평균 응답시간·랭킹·연속일·가상 학급/브라우저 체험 통계·push·PR·merge·운영 배포는 추가하지 않는다. 작업별 커밋을 구분한다.

## Review Focus

1. 빈 학급·미응답·timeout의 null choice를 혼동하여 0% 또는 잘못된 오답을 만드는가 — Task 1 `emptyClassAndUnansweredKeepNullRates`, Task 2 `timeoutAndUnansweredHaveDifferentStates`.
2. 목록 검색/페이지가 통계 분모·상위 오답 3개를 바꾸거나, 1·2명 학급에 최소 3명 설명을 고정하는가 — Task 1 `filteredRowsDoNotChangeClassSummaryOrHardQuestions`, Task 3 `hardQuestionThresholdMatchesEnrolledCount`.
3. 숫자 검색 `01`·매우 긴 숫자·NFC 이름이 500 또는 불안정한 정렬을 만드는가 — Task 1 `leadingZeroAndLongSearchRemainDeterministic`.
4. 이전/다음 학생이 현재 페이지 또는 필터 안에서만 이동하여 학생을 누락하는가 — Task 2 `neighborIdsCrossFilteredPageBoundaries`, Task 3 `detailNavigationPreservesListUrlButUsesWholeClassOrder`.
5. 교사 전환·학급 전환 뒤 늦은 응답·모달이 이전 학생 기록을 보여주는가 — Task 3 `lateOtherOwnerAndClassResponsesCannotRenderPrivateRows`.

## File Map and Order

`backend/.../staff/learning`는 권한/사실 로더/순수 집계/DTO/HTTP를 분리한다. `frontend/src/features/staff/learning`는 직원 query와 현황/학생 상세/문항 모달/차트를 분리한다. 기존 classroom/auth는 통계 진입 링크만 확장하고 관리 권한·가입 코드는 그대로다.

모든 task는 새 구현자, RED/GREEN, 자체 검토·작업 커밋, 독립 spec/quality gate를 거친다. 판정·상태·원장 갱신은 이 모듈 책임이 아니다. 최종 combined 검증에서 선행 게임과 기존 auth/learning 회귀도 확인한다.

---

### Task 1: Authorized class facts, aggregate and paginated student overview

**Files:** Create `backend/src/main/java/kr/hanbit/school/staff/learning/{StaffLearningAccess,TeacherLearningFacts,TeacherLearningFactsLoader,TeacherLearningAggregator,TeacherLearningSummary,TeacherStudentRow,TeacherQuestionRow,Distinction,PageResult,TeacherStudentsPage,StudentListQuery,TeacherLearningModule,TeacherLearningController}.java`; tests `backend/src/test/java/kr/hanbit/school/staff/learning/{TeacherLearningAggregatorTest,TeacherLearningOverviewIT}.java`.

**Interfaces:**
- `StaffLearningAccess.requireClassroom(AccountPrincipal,UUID): Classroom` validates current account role/school/password restriction, not merely classroom teacher association; `requireStudent(AccountPrincipal,UUID classroomId,UUID studentId): StudentProfile` additionally validates exact profile classroom and account school/role.
- `TeacherLearningFactsLoader.load(UUID schoolId,UUID classroomId,String version): TeacherLearningFacts` loads roster with actual nullable characterId, canonical 150 questions, first facts, passed progress and mastery facts in bounded bulk queries. No per-student query loop, private queue/bookmark or last answer read.
- `TeacherLearningAggregator.summarize(TeacherLearningFacts): TeacherLearningSummary`; `.students(TeacherLearningFacts): List<TeacherStudentRow>`; `.questions(TeacherLearningFacts): List<TeacherQuestionRow>`.
- `PageResult<T>(List<T> items,int page,int size,long total)`; `Distinction(int answered,int correct,Double accuracy)`.
- `TeacherLearningSummary(int studentCount,int participatingCount,int completeCount,int answered,int correct,int choiceWrong,int timedOut,int wrong,int reviewedWrong,int pendingWrong,int unanswered,Double accuracy,Distinction facts,Distinction interpretations,List<TeacherQuestionRow> hardQuestions)`.
- `TeacherStudentRow(UUID accountId,int studentNumber,String name,String characterId,String status,int answered,int correct,int wrong,int timedOut,int reviewedWrong,int pendingWrong,int passedDayCount,Double accuracy)`; status NEW/IN_PROGRESS/COMPLETE.
- `TeacherQuestionRow(int questionId,int dayNumber,String text,String correctChoice,int answered,int correct,int choiceWrong,int timedOut,int wrong,int unanswered,Double wrongRate)`.
- `TeacherStudentsPage(TeacherLearningSummary summary,PageResult<TeacherStudentRow> students)`; `StudentListQuery(String search,String status,String sort,int page,int size)`; `TeacherLearningModule.students(AccountPrincipal,UUID,StudentListQuery): TeacherStudentsPage`; GET `/api/staff/classrooms/{classroomId}/learning/students`.

- [ ] **Step 1: Write failing pure and actual PostgreSQL/API tests.** Names: `emptyClassAndUnansweredKeepNullRates`, `reviewCorrectNeverChangesFirstAccuracy`, `filteredRowsDoNotChangeClassSummaryOrHardQuestions`, `leadingZeroAndLongSearchRemainDeterministic`, `sameSchoolNonManagingTeacherCanReadButOtherSchoolCannot`, `forcedPasswordChangeAndStudentRolesAreRejected`, `overviewIsReadOnlyAndExcludesPersonalState`.

```java
// 3 enrolled, first facts: correct1 / choiceWrong2 / timeout1, one original wrong mastered.
assertThat(summary.answered()).isEqualTo(4);
assertThat(summary.wrong()).isEqualTo(3);
assertThat(summary.unanswered()).isEqualTo(446);
assertThat(summary.accuracy()).isEqualTo(0.25);
assertThat(summary.reviewedWrong()).isEqualTo(1);
assertThat(summary.pendingWrong()).isEqualTo(2);
// Empty class: accuracy/fact accuracy/interpretation accuracy null, counts zero.
// Hard questions: ≥min(3,enrolled) responses AND wrong>0, rate↓/answered↓/id↑, max3.
// A filtered one-row page must keep the same full-class summary/hardQuestions.
```

- [ ] **Step 2: Run RED.** `./backend/gradlew -p backend test --tests '*TeacherLearningAggregatorTest' --tests '*TeacherLearningOverviewIT'`. Reuse existing TestFixtures school/teacher/student and real SessionTestClient; expired-worker disabled as existing default avoids background mutation when asserting read-only state.
- [ ] **Step 3: Implement interfaces.** Authorize before loading content/records. Use current version and a read-only REPEATABLE_READ snapshot. Roster names/numbers/characterId are actual DB facts, with no equipped/private state. Pure aggregator implements spec equations and O/X denominators using canonical question type. Merge separately keyed fact/progress/mastery sources, not a multiplicative JOIN. NEW is no first answers, COMPLETE is 30 PASSED, else IN_PROGRESS. Search NFC/trim up to 100 codepoints; ASCII numeric search with leading zeros matches actual student number, oversized numeric search returns no numeric match rather than throwing. Validate status ALL/NEW/IN_PROGRESS/COMPLETE and spec sorts/page/size; out-of-range page returns empty items and correct total.
- [ ] **Step 4: Run GREEN + permission/read-only assertions.** Same focused command. API response keys must omit bookmarks/reviewQueue/reason/lastOutcome/password/joinCode; assert first/review/xp/progress/session/appearance tables unchanged by overview GET. Tie order is stable through repeated reads.
- [ ] **Step 5: Commit.** `feat: expose authorized teacher class learning overview`.

### Task 2: Student history, whole-class neighbors and question analysis

**Files:** Create `backend/src/main/java/kr/hanbit/school/staff/learning/{TeacherAnswerState,TeacherAnswerRow,TeacherDayRow,TeacherStudentDetail,AnswerListQuery,QuestionListQuery,TeacherQuestionDetail,TeacherRespondent}.java`; modify `backend/src/main/java/kr/hanbit/school/staff/learning/{TeacherLearningModule,TeacherLearningController,TeacherLearningAggregator}.java`; tests `backend/src/test/java/kr/hanbit/school/staff/learning/{TeacherLearningDetailIT,TeacherLearningQuestionsIT}.java`.

**Interfaces:**
- Consumes Task 1 access/facts/summary/rows/PageResult and source current content; no student learning status/session read needed for staff queries.
- `TeacherAnswerState = UNANSWERED|CORRECT|WRONG|TIMED_OUT`; `TeacherAnswerRow(int questionId,int dayNumber,int position,String text,String correctChoice,String firstChoice,TeacherAnswerState outcome,Instant firstAnsweredAt,boolean reviewedWrong)`.
- `TeacherDayRow(int dayNumber,String state,int answered,int correct,int timedOut,Instant passedAt)`; `TeacherStudentDetail(TeacherStudentRow student,List<TeacherDayRow> days,PageResult<TeacherAnswerRow> answers,UUID previousStudentId,UUID nextStudentId,int ordinal,int totalStudents,Distinction facts,Distinction interpretations)`.
- `AnswerListQuery(int day,String filter,int page,int size)` defaults 0/WRONG/0/8; filters WRONG(including timeout), TIMEOUT, ALL(answered only), UNANSWERED.
- `QuestionListQuery(int day,String search,String sort,int page,int size)` defaults 0/empty/WRONG_RATE_DESC/0/10. `TeacherRespondent(UUID accountId,int studentNumber,String name,String firstChoice,TeacherAnswerState outcome)`; `TeacherQuestionDetail(TeacherQuestionRow question,String explanation,List<TeacherRespondent> correct,List<TeacherRespondent> wrong,int unanswered)`.
- `TeacherLearningModule.student(AccountPrincipal,UUID,UUID,AnswerListQuery): TeacherStudentDetail`; `.questions(AccountPrincipal,UUID,QuestionListQuery): PageResult<TeacherQuestionRow>`; `.question(AccountPrincipal,UUID,int): TeacherQuestionDetail` and spec's three remaining staff GET routes.

- [ ] **Step 1: Write failing history/analysis tests.** Names: `timeoutAndUnansweredHaveDifferentStates`, `neighborIdsCrossFilteredPageBoundaries`, `thirtyDaySummaryRemainsOutsideAnswerPagination`, `questionRatesUseActualRespondentsAndExcludeUntouchedFromWrong`, `wrongRateSortIsStableWithNullLast`, `studentAndClassroomMustMatchSameSchool`, `firstRecordsRemainIdenticalAfterReplayAndMastery`, `invalidQueryAndUnknownQuestionReturnNoPrivateData`.

```java
// 25 enrolled, filtered overview page has only #21: detail #20 still sees #19 and #21.
assertThat(detail.ordinal()).isEqualTo(20);
assertThat(detail.totalStudents()).isEqualTo(25);
// Question: 2 answered, 1 correct, 1 timeout, 1 untouched -> wrongRate .5, unanswered1.
assertThat(question.wrongRate()).isEqualTo(0.5);
assertThat(question.timedOut()).isEqualTo(1);
assertThat(question.unanswered()).isEqualTo(1);
// FIRST wrong -> later REVIEW correct: original outcome/choice unchanged, reviewedWrong true.
```

- [ ] **Step 2: Run RED.** `./backend/gradlew -p backend test --tests '*TeacherLearningDetailIT' --tests '*TeacherLearningQuestionsIT'`.
- [ ] **Step 3: Implement exact contracts and selection.** Detail first authorizes requested student/profile/account, maps 150 canonical questions to first states, and provides 30 ordered day summaries independently of paginated answer filter/day. Whole-class number/accountId neighbors ignore overview filters; edges are null and ordinal is 1-based. Question search matches content or numeric ID; day 0..30, spec sort enums and stable null-last order. Wrong respondent list includes timeout with null firstChoice but distinct state. Teacher-only correctChoice/explanation come from content DB; no frontend canonical copy. Unknown q 1..150 outside catalog is 404, malformed range/filter/page is 400.
- [ ] **Step 4: Run GREEN and old core/private regressions.** Focused staff suites plus `*LearningReplayIT`, `*LearningReviewIT`, `*LearningQuestionListIT`. Snapshot persisted first rows before/after repeat and staff reads; teacher DTO/query must not touch private tables even when student has USER queue and bookmark.
- [ ] **Step 5: Commit.** `feat: add preserved student history and teacher question analysis`.

### Task 3: Actual teacher dashboard, student detail and accessible question dialog

**Files:** Create `frontend/src/features/staff/learning/{types.ts,api.ts,queries.ts,StatisticsPage.tsx,StudentDetailPage.tsx,QuestionDetailDialog.tsx,StatisticsCharts.tsx,stats.css,api.test.ts,StatisticsPage.test.tsx,StudentDetailPage.test.tsx,QuestionDetailDialog.test.tsx}`; create `frontend/src/test/teacherLearningFixtures.ts`; modify `frontend/src/features/staff/{ClassroomsPage.tsx,ClassroomsPage.test.tsx}` and `frontend/src/app/router.tsx`.

**Interfaces:**
- Mirror Tasks 1–2 DTO/property names and nullable rates/timestamps/neighbors in TS. Imports game `CharacterId`, `GameAvatar` from the preceding game plan's actual code; render only base equipment for staff student avatars.
- API exports `getTeacherStudents(classroomId,query,signal?)`, `getTeacherStudent(classroomId,studentId,query,signal?)`, `getTeacherQuestions(classroomId,query,signal?)`, `getTeacherQuestion(classroomId,questionId,signal?)` through existing request; return exact server types.
- `teacherLearningKeys` includes accountId/classroomId/query/studentId/questionId; exports useTeacherStudents/useTeacherStudent/useTeacherQuestions/useTeacherQuestion, enabled only for accepted STAFF without mustChangePassword.
- `StatisticsCharts.tsx` exports `ClassSummaryCharts({summary:TeacherLearningSummary})` with region aria-label `학급 요약`, and `StudentSummaryCharts({student:TeacherStudentRow,facts:Distinction,interpretations:Distinction})`; percentages use server rates, not the current page denominator.
- Routes: `/staff/classrooms/:classroomId/learning` and `/staff/classrooms/:classroomId/learning/students/:studentId`, both RequireRole TEACHER/ADMIN. Overview uses URL params tab/search/status/sort/page/day/question; no fictional data/source switch. `QuestionDetailDialog({classroomId,questionId:number|null,onClose:()=>void})` fetches only while open.

- [ ] **Step 1: Write real-page/MSW failing tests.** Names: `showsServerSummaryWithoutRecomputingFromCurrentPage`, `hardQuestionThresholdMatchesEnrolledCount`, `filtersAndSortsUseServerQueryAndZeroRatesShowDash`, `detailNavigationPreservesListUrlButUsesWholeClassOrder`, `lateOtherOwnerAndClassResponsesCannotRenderPrivateRows`, `questionDialogTrapsFocusEscapeAndRestoresTrigger`, `teacherNamesAndQuestionTextRenderAsTextNotHtml`, `noPrivateStudentQueueControlsInTeacherView`.

```ts
// summary accuracy .25 while filtered page contains one correct student -> still 25%.
// null rate -> —, not 0%; chosen character comes from row, not random array index.
expect(within(screen.getByRole('region',{name:'학급 요약'})).getByText('25%',{exact:true})).toBeVisible()
// Neighbor nextStudentId outside current page -> route to actual next ID; return list restores prior query.
// Malicious name '<img src=x onerror=...>' is visible text; no image/event markup inserted.
```

- [ ] **Step 2: Run RED.** `pnpm --dir frontend test src/features/staff/learning/api.test.ts src/features/staff/learning/StatisticsPage.test.tsx src/features/staff/learning/StudentDetailPage.test.tsx src/features/staff/learning/QuestionDetailDialog.test.tsx`.
- [ ] **Step 3: Implement referenced statistics layouts.** Actual classroom title, student overview strips/distribution/O-X chart/hard top3/roster, question table, 30-day grid, filters/page controls and detailed respondent dialog. Charts carry numeric accessible descriptions/captions; colors are supplemental. Labels use 미개선 오답 or explain that 복습 남음 is not private queue count. Back link preserves list URL, neighbor controls state `학급 전체 번호순`; stop at null edges and reset answer page on day/filter change. Modal focus traps/returns, Escape closes, request cancellation guards owner/class changes. No new auth handler or fake DATA fallback. Existing classroom cards get a class-specific 학습 통계 link without changing join-code permissions.
- [ ] **Step 4: Run GREEN + staff/auth/router regressions and build/lint.** Include existing ClassroomsPage/TeacherAccountsPage/RequireRole/AccountLifetime tests. Inspect nonstudent direct route rejection, fetch errors/retry, empty class/results, oversized table mobile layout and role-safe navigation. Apply the React best-practices skill checklist after the multiple TSX edits.
- [ ] **Step 5: Commit.** `feat: connect real teacher learning dashboards and drilldowns`.

### Task 4: Combined real-flow verification and final branch record

**Files:** Create `frontend/e2e/teacher-learning-flow.spec.ts` and `docs/verification/2026-10-13-teacher-learning-statistics.md`; extend previous game's `learning-helpers.ts` only with reusable fixture/API support; update game verification with final combined SHA if actual behavior changed.

**Interfaces:** Reuse validated loopback `HANBIT_E2E_BASE_URL` and `HANBIT_E2E_COMPOSE_PROJECT` from game Task 7, dedicated `hanbit-game-e2e` / 8090 / own volume and fresh synthetic accounts. No prod operations. Consume real new endpoints and router, not mock data inside browser.

- [ ] **Step 1: Write failing real teacher browser cases.** `teacherClassShowsActualFirstAnswerAndReviewImprovement`, `filteredTeacherRosterDoesNotAlterSummaryOrHardQuestions`, `studentDetailCrossesPagesAndPreservesFirstWrongAfterReview`, `teacherQuestionDialogShowsTimeoutSeparateFromUntouched`, `anotherSchoolAndStudentCannotReadLearningStats`, `logoutAndClassSwitchClearPreviousStats`. Synthetic fixture creates at least two students in one new class; one has 4/5 first correct and one untouched: class accuracy80%, unanswered295, wrong1/participating1. REVIEW the first wrong correctly: still80% and first wrong remains, reviewedWrong1/pendingWrong0 even when USER queue remains private. API responses contain no private queue/bookmark data.
- [ ] **Step 2: Run RED against rebuilt isolated app.** Build backend/web and replace backend→healthy→web only in hanbit-game-e2e; run `pnpm --dir frontend exec playwright test e2e/teacher-learning-flow.spec.ts` with loopback/project overrides. No fixed sleeps, real stdout exit/result inspection. If shared target is unavailable, choose a new scoped test target rather than stopping another goal's server.
- [ ] **Step 3: Implement verification helpers/assertions only.** No product fixes in this task/controller; report a product defect to the owning implementation task for fix/review. Protect fixture secret-fill failures; no trace/video/private DOM output. Use real auth/learning APIs or explicit isolated database fixtures for many-student paging and cross-school access, document which assertions use which, never seed production rows. A cross-school fixture must have its own actual school/class and valid changed-password staff login so 403 FORBIDDEN proves school isolation rather than merely PASSWORD_CHANGE_REQUIRED. Compare chart/rows/modal to actual response values and exact filter/order semantics.
- [ ] **Step 4: Run GREEN and combined completion gate.** Full backend test, frontend test/build/lint, entire Chromium suite plus art-only renderer case on its dev target. Inspect JUnit XML actual counts, zero failures/errors/skips, role/auth regressions, all G01–G14 mapping, 360/1280px controls/overflow/focus/reduced motion. Verify avatar/gear/gift/map/history survive supported restarts/re-login and all original core rules still hold. Recheck canonical question/explanation matches in student production JS are 0. Record exact SHA, commands, output counts, visual screenshots and provenance; distinguish actual fresh tests from reused unchanged evidence.
- [ ] **Step 5: Commit, independent final review, then handoff.** `test: verify combined game and teacher learning flows`. Controller generates a whole-branch package from main merge-base to HEAD and dispatches the most capable available reviewer, not an implementer self-review. Process findings through the SDD final fix wave/scoped re-review, persist exhaustive rulings in Git-backed evidence and final answer before recovering/removing this plan's scratch. Use finishing-a-development-branch once both feature plans and verification are complete; do not push/PR/merge/deploy without separate user authorization. Mark the full goal complete only when every G01–G14 requirement is supported by current evidence.

## Controller Self-Review and Handoff

G08→1/2/3/4; G09→1/2/3/4; teacher G10→1/2/3/4; teacher G12→3/4; teacher G13→3/4; combined G14→4/final review. All other G requirements are owned by the preceding game plan and rerun where modified by combined changes. Five Review Focus items each have named covering tests. TypeScript mirrors server DTOs; PageResult property is `items`, class summary is separate from paginated `students`, and all consumers use those names.

Status: plan prepared for user review; preserve the already chosen SDD method. Execute after both linked plans are approved, without inter-task confirmation requests.
