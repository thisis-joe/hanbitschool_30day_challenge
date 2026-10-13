# 학생 학습 UI 실행 검증

2026-10-13 KST, 이 문서의 본문은 학생 학습 UI 소스 `218d874`에 대한 Task 4 당시 실행 기록입니다. 그 당시 프런트엔드 전체는 146 tests, backend는 559 tests를 통과했고 전체 Chromium 17개 사례도 통과했습니다. 이후 HEAD `1725395`에 대한 수정·재검토에서 원래 네 finding은 모두 해결됐지만, 초기 anonymous `/me` 401이 진행 중인 성공 로그인 응답을 폐기할 수 있는 새 Important/P2 문제가 확인되어 fix round는 열려 있습니다. 따라서 과거의 매핑별 통과 결과는 해당 사례와 당시 코드에 한정된 역사적 근거이며, 현재 shippable 또는 운영상 성공 상태를 뜻하지 않습니다. 학생 학습 UI의 운영 재배포는 수행하지 않았습니다.

## 최신 수정·재검토 gate

이후 product HEAD `17253958042acf3509f82f79bb6ec26a463025da`에 수정 커밋 `8e91211`, `2742014`, `1725395`가 추가됐습니다. 세 커밋의 focused frontend 회귀는 64 tests 통과, 전체 frontend는 18 files / 158 tests 통과, build와 lint도 exit 0이었습니다. 실제 Chromium은 17개 사례가 50.4초에 통과했습니다. 세부 실행 결과는 `final-fix-report.md`에 기록되어 있습니다. backend 29 suites / 559 tests 결과는 변경되지 않아 Task 4 실행 결과를 재사용했으며 이번 fix wave에서는 재실행하지 않았습니다.

이 gate에서 Task 4의 원래 네 finding은 모두 ADDRESSED로 판정됐습니다. 하지만 재검토는 새로운 Important/P2 문제를 확인했습니다. 초기 익명 상태의 `/me` 요청이 로그인 POST와 겹칠 때 그 `/me`의 401이 계정 epoch를 바꾸고, 이어 도착한 성공 로그인 200을 AbortError로 폐기할 수 있습니다. 관찰된 화면은 연결 오류를 표시하고 로그인 재시도는 성공합니다. 넓은 frontend/browser suite는 이 지연된 초기화 경합을 다루지 않으므로 통과 결과가 출시 준비를 증명하지 않습니다. 관련 근거는 `final-rereview-report.md`에 있습니다.

가장 작은 수정 경계는 초기 또는 이미 익명인 `/me` 결과를 실제 인증된 owner의 이탈과 분리하는 것입니다. 익명 상태를 게시하고 필요한 저장소 정리를 하되, 그 익명 수명에서 시작된 로그인 시도를 무효화하지 않도록 해야 합니다. 실제 owner 이탈에 대한 epoch 증가·비공개 상태 정리와 오래된 owner 응답 방어는 유지해야 합니다. SDD의 단일 최종 수정 wave 한도에 도달했고 예외 승인은 아직 없으므로 추가 제품 수정과 배포는 사람의 프로세스 지시를 기다립니다. 현재 운영 UI는 재배포되지 않았습니다.

## 검증 대상과 범위

검증한 학생 UI 소스는 `218d8746f09f82aba4cd1870654d4cfdcfc04e8f`입니다. 브랜치 시작점은 `027b4ec`, Task 4 시작점은 `88b50741663719fd63af2006e4a268956d167760`입니다. Task 4는 E2E·테스트 실행 도우미·문서만 변경했습니다. 테스트 작성 중 발견한 U15 최근 결과 표시 누락은 별도 Task 3 수정·독립 리뷰 후 `218d874`로 반영되었습니다.

| UI 작업 커밋 | 범위 |
| --- | --- |
| `50539c4` | 학습 API, 학생별 query, 불확실한 명령과 서버 시계 |
| `b517f2f` | 문제·해설·결과 화면 |
| `1cdbbcc` | 결과 화면의 활성 세션 충돌 복구 |
| `745f781` | 학습 홈·개인 문제 목록·계정 연결 |
| `88b5074` | 홈 첫 답변 진행·계정 복구 |
| `218d874` | 개인 목록의 최근 정답·오답·시간 초과·미답변 표시 |

학습 홈, O · 사실 / X · 해석, 서버 제한시간, 해설, 다섯 번째 답변 자동 저장, 재도전·재학습, 선택 REVIEW, 개인 목록과 별표를 검증했습니다. 보상 아이템·아바타·장비·지도·랭킹·연속일·교사 학습 통계 UI를 추가하지 않았습니다. 운영 schema migration과 학습 코어 규칙도 변경하지 않았습니다.

## 실제 실행 환경

| 항목 | 관찰값 |
| --- | --- |
| Java / Gradle | OpenJDK 21.0.11 / Wrapper 8.14.6 |
| PostgreSQL | 격리 E2E `postgres:17`, 실제 17.11, aarch64 |
| Node / pnpm | 명령별 Node v24.21.0 / pnpm 11.25.0; 전역 Node 변경 없음 |
| Playwright / Chromium | 1.64.0 / 공식 Chromium 1248, Chrome for Testing 156.0.8078.4 |
| frontend | Vitest 5.0.3 / Vite 8.3.4 / TypeScript 6.0.3 |
| E2E 서버 | `hanbit-account-e2e`, `http://localhost:8088`, 별도 `hanbit-account-e2e_school-data` 볼륨 |

이미 설치된 Chromium을 사용했고 다운로드를 반복하지 않았습니다. `.env.e2e.local`은 새 테스트 전용 값으로 생성했고, 파생 `.env.e2e-no-bootstrap.local`과 함께 ignored·권한 600입니다. 운영 자격 증명은 읽거나 복사하지 않았습니다. DB와 backend는 외부 포트를 공개하지 않고 web만 127.0.0.1:8088에 연결합니다. E2E의 HTTP local 쿠키 설정과 운영 기본 Secure 쿠키 설정은 기존대로 유지했습니다.

초기 준비와 U15 수정 후 web만 갱신한 명령은 다음과 같습니다.

```bash
docker compose -p hanbit-account-e2e --env-file .env.e2e.local -f infra/compose.local.yml up --build -d --wait
docker compose -p hanbit-account-e2e --env-file .env.e2e.local -f infra/compose.local.yml up --build --no-deps -d --wait web
```

두 명령 모두 exit 0입니다. 테스트 데이터는 실제 관리자 발급 → 교사 첫 비밀번호 변경 → 학급 생성 → 학생 가입·로그인 화면으로 만들었습니다. 학습 학급 시작일은 서버 HTTP Date의 서울 날짜에서 하루 전으로 설정하여 두 회차를 열었습니다. SQL로 학생·학습 행을 주입하지 않았습니다.

## 최종 검증 명령과 결과

```bash
./backend/gradlew -p backend clean test
env -u NO_COLOR npx --yes --package=node@24 --package=pnpm@11.25.0 -c 'node --version && pnpm --version && pnpm --dir frontend test && pnpm --dir frontend build && pnpm --dir frontend lint'
env -u NO_COLOR npx --yes --package=node@24 --package=pnpm@11.25.0 -c 'pnpm --dir frontend exec prettier --write e2e/account-flow.spec.ts && pnpm --dir frontend exec tsc -b && pnpm --dir frontend exec eslint e2e/account-flow.spec.ts e2e/learning-flow.spec.ts e2e/helpers.ts playwright.config.ts && pnpm --dir frontend exec playwright test e2e/account-flow.spec.ts'
env -u NO_COLOR npx --yes --package=node@24 --package=pnpm@11.25.0 -c 'pnpm --dir frontend test:e2e'
```

| 검증 | 최종 결과 |
| --- | --- |
| clean backend 전체 | exit 0, `BUILD SUCCESSFUL in 2m 43s`, 29 suites / **559 tests / 0 failures / 0 errors / 0 skipped**; JUnit XML 속성 합산 |
| frontend 전체 | exit 0, **17 files / 146 tests passed**, 7.92s |
| TypeScript / production build / ESLint | exit 0, 99 modules, Vite build 107ms, lint 오류 없음 |
| 준비된 UI의 학습 집중 E2E | exit 0, **5 passed / 0 failed / 0 skipped**, 30.2s |
| 재시작 도우미 수정 후 account 집중 | exit 0, **1 passed / 0 failed / 0 skipped**, 16.7s; 변경 E2E 파일의 TypeScript·scoped lint도 통과 |
| 준비된 최종 harness의 전체 Chromium | exit 0, **17 passed / 0 failed / 0 skipped**, 49.3s |
| 학생 browser bundle 검사 | 정본 150문항의 원문·해설과 생성 JS를 대조, 원문 0 / 해설 0 일치 |

학습 집중 명령은 `env -u FORCE_COLOR npx --yes --package=node@24 --package=pnpm@11.25.0 -c 'pnpm --dir frontend exec prettier --write e2e/learning-flow.spec.ts && pnpm --dir frontend exec playwright test e2e/learning-flow.spec.ts'`였습니다. Playwright 자식 프로세스가 FORCE_COLOR를 설정하여 남은 색상 옵션 경고는 최종 명령에서 NO_COLOR만 제거해 해결했습니다. 전역 환경이나 실제 앱 경고를 억제하지 않았습니다. Backend에는 기존 JVM class-data-sharing 경고가 있었으며 실패·오류·건너뜀은 없습니다. Vitest의 jsdom 성능 안내도 실패가 아닙니다.

통과한 동일 backend/frontend 전체 suite는 반복하지 않았습니다. 이후 승인된 account E2E 변경에는 TypeScript와 해당 파일 lint·집중 account·전체 browser 검증을 수행했습니다. 전체 로그·JUnit XML·실행 marker는 ignored 경로에 보관하고, 비밀번호·사용자 행을 일반 출력에 남기지 않았습니다.

## 실제 학습 사례

| 이름 | 검증한 서버·화면 동작 |
| --- | --- |
| `studentCanPassFiveQuestionsAndRestoreTheSavedResult` | 로그인 학습 홈, 날짜/순서 잠금, FIRST 5/5, 해설과 서버 XP, 다섯 번째 답변만으로 COMPLETED 저장, 완료하기 없이 새로고침, 결과 이동·재로그인 동안 학습 POST 0회, 같은 저장 결과·누적 5069 XP, 다음 FIRST 2회차 |
| `failedDayReplayPassKeepsFirstFactsAndPaysOneXpPerRepeat` | FIRST 2/5 실패, 전체 5문항 REPLAY 3/5 통과, 반복 기본 1 XP와 최초 통과 지급, firstAnswerCount 5 유지·원래 세션 결과 유지, 통과 회차의 이후 0/5 재학습에도 day PASSED 유지·답변당 정확히 1 XP |
| `questionAndFeedbackResumeKeepTheSameServerDeadline` | QUESTION_ACTIVE 새로고침, 독립 browser context의 두 번째 로그인, AWAITING_ADVANCE 새로고침에 같은 deadlineAt, 기존 기기에서 확정 해설 복구, 미완료 결과 경로는 풀이로 이동 |
| `expiredQuestionRestoresServerTimeout` | 실제 worker가 PostgreSQL에 TIMED_OUT 확정, browser answer/advance POST 0회, 같은 문항·deadline·확정 답변 UUID 복구, 서버 374 XP, 개인 목록의 최근 결과 시간 초과 |
| `privateQueueBookmarkAndConsentRemainIndependent` | 처음 오답의 AUTO, 별표, 올바른 REVIEW 후 AUTO 해제·mastery 유지, 나중 오답의 제안 거절 PUT 0회/동의 PUT 1회, USER 큐는 정답 후에도 유지, 별표 제거와 큐 제거 독립, 최근 오답/정답과 mastery·queue·star 분리, 세 filter와 활성 세션 충돌·선택 없음 |

다섯 번째 `xpAwarded`는 해당 답변 지급과 최초 회차 통과 지급을 함께 포함합니다. FIRST 5/5의 마지막 응답은 1314+1124=2438, 실패 뒤 처음 통과한 REPLAY의 마지막 응답은 1+1124=1125입니다. 학생 화면은 이 서버 값을 그대로 표시하며 지원되지 않는 시도 XP 총합을 계산하지 않습니다. 첫 답변 사실의 직접 불변성은 실제 PostgreSQL `LearningReplayIT.retryPassPreservesFirstFactsAndWritesFiveIndependentOneXpRepeatFacts`도 검증합니다. Browser는 노출된 firstAnswerCount와 원래 세션 결과를 확인하고, API에 없는 개인 첫 outcome·queue reason을 추정하지 않습니다.

기존 account/teacher regression은 초기 비밀번호의 일회성 표시, 강제 변경, 실제 이름·번호 명단, 서버 재시작 후 학생 정보·교사 명단, bootstrap env 제거 후 기존 관리자 로그인, 학생 내 정보·뒤로가기·직원 경로 거절을 유지합니다. 기존 320/390/768/1440px 가입·로그인 여덟 사례와 키보드 오류 안내도 모두 통과했습니다.

## U01–U18 근거

브라우저 사례는 위 표의 이름을 사용하며, 나머지 named tests는 이번 전체 suite에서 통과했습니다.

| ID | 근거 |
| --- | --- |
| U01 | 당시 로그인 학습 홈·계정·로그아웃 E2E 및 `studentPasswordChangeLandsOnLearningHome`, `studentEndpointsRequireAStudentLoginAndCsrf`; 이후 지연된 초기 anonymous `/me` 401과 로그인 200의 경합은 이 매핑으로 검증되지 않았으며 최신 재검토에서 미해결 P2로 확인됨 |
| U02 | FIRST/replay E2E의 서버 status·XP·firstAnswerCount, dashboard `homeHandles%sWithoutStarting`, `homeStartsCanonical%sTarget`, `homeContinueUsesActualSessionId`, `homeShowsServerFirstAnswerProgressWithoutDerivingFromPassedDays` |
| U03 | 실제 2회차 순서/3회차 날짜 잠금·과거 REPLAY, `thirtyDayCardsDistinguishPassedSequenceAndDateLocks`, `activeSessionBlocksStartingAnotherTarget`, `freshActiveSessionPreventsStaleHomeStart` |
| U04 | 실제 O/X 문제, `activeQuestionDoesNotRevealAnswerOrExplanation`, 150 원문·해설 bundle 대조 0건; 정본 답은 Node E2E fixture에서만 사용 |
| U05 | deadline 재개 E2E, `wallClockJumpNeverExtendsTheLiteralDeadline`, `resumeKeepsTheOriginalDeadlineInQuestionAndFeedback` |
| U06 | 실제 worker timeout E2E, `zeroCountdownWaitsForTheServerAndNeverAdvances`, `returningToThePageRereadsCanonicalStateAndCleansUpListeners`, slow-read polling 회귀 |
| U07 | 실제 고정 command 응답, `fastDoubleClickSubmitsOnlyOneLogicalAnswer`, `lostResponseRetryKeepsTheSamePayloadAndRequestId`, `csrfRecoveryReusesThePersistedCommandAfterRemount` |
| U08 | `pendingCommandsAreScopedToTheExactStudentAndStoreOnlyTheCommand`, `corruptPendingCommandsAreDiscardedInsteadOfReplayed`, `blockedStorageRetainsAnInMemoryRetry`, uncertain answer/start/advance 재개 회귀 |
| U09 | 실제 question→feedback→명시적 advance→completed, `answerAndAdvanceExposeLoadingAndRequireAnExplicitNextQuestion` |
| U10 | 실제 outcome/correctChoice/explanation/xpAwarded와 정답·오답·시간 초과 문구; timeout·오답에도 확정 해설 제공 |
| U11 | 다섯 번째 자동 저장·reload/re-login·완료 이동 중 학습 POST 0회, `completedSessionRestoresWithoutAFinishMutation`, `unfinishedResultRedirectsToCurrentSession` |
| U12 | 2/5 실패→3/5 통과→통과 회차 0/5 재학습 E2E, nullable REVIEW 완료 E2E, `passedReplayNeverDisplaysRevokedProgress`, `reviewCompletionDoesNotClaimEveryQuestionIsMastered` |
| U13 | 서버 cap 내 다음 FIRST, 전체 5문항 REPLAY·서버 지급, `nextActionUsesFreshStatusAndForbidsDateCapBypass`, `nextActionRecoversANewActiveSessionInsteadOfStartingAnother` |
| U14 | 실제 consent 거절/동의와 USER 유지·별표 독립, `reviewPromptOnlyAddsAfterConsent`, `newFeedbackOffersConsentWhileSameFeedbackKeepsDismissal` |
| U15 | 실제 세 filter·선택 REVIEW·명시적 제거·latest outcome와 mastery/queue/star 분리, `serverLastOutcomeRemainsIndependentFromPersonalStates: %s`, `reviewSelectionIncludesOnlyActiveQueuedQuestionsInVisibleOrder`, 빈 목록/활성 세션 회귀 |
| U16 | 당시 `accountSwitchClearsCache`, `switchingStudentsDoesNotRenderPreviousLearningData`, `latePreviousAccount401DoesNotClearTheNewStudentsPendingCommand`, `accountChangeAbortsReadsAndIgnoresLateMutationCompletion`, logout/401 정리와 역할 전환 E2E는 해당 사례에서 통과. 이후 확인된 초기 익명 `/me`와 진행 중 로그인 경합을 다루지는 않으며, 과거 매핑 통과는 현재 인증 수명 경계의 전면 검증이나 출시 준비를 뜻하지 않음 |
| U17 | 360/1280px 대표 home/question/feedback/result/private-list DOM overflow ≤0, 모든 측정 header/학습 버튼·링크·checkbox label ≥48px; Tab/Enter 제출·보이는 outline·새 문항/해설/result heading focus. Countdown live attribute 없음 확인, reduced-motion CSS 검토 |
| U18 | Task 4 당시 실제 PostgreSQL/Chromium 학습과 기존 계정·교직원 포함 17 E2E, backend 559·frontend 146·build/lint 통과. 이후 product HEAD `1725395`에서도 frontend 158·build/lint 및 Chromium 17 통과, backend 559는 재실행하지 않고 재사용했으나, 최신 재검토에서 초기 anonymous `/me` 로그인 경합 P2가 열려 있음. **현재 shippable/operational success가 아니며 추가 수정에 대한 사람의 프로세스 지시와 운영 재배포가 대기 중** |

## 실행 중 수정과 근거

테스트 정본 JSON root를 object로 잘못 읽은 import, 다섯 번째 응답 XP 범위, protected-route logout의 `returnTo` query는 테스트 작성 오류로 바로잡았습니다. 구현 누락의 RED로 보고하지 않았습니다.

처음 전체 browser 실행은 **17 failed / 0 passed / 0 skipped**, exit 1이었습니다. 기존 account test의 동시 `restart backend web` 동안 Nginx가 backend DNS보다 먼저 시작하여 `host not found in upstream "backend"`로 종료됐습니다. 첫 account case의 90초 readiness 실패 이후 나머지 16개는 연결 거절이었습니다. Controller가 account test 범위 확장을 승인한 뒤 두 restart/recreation site 모두 **backend → 실제 Docker healthy → web → 공개 HTTP 200** 순서로 고쳤습니다. 임의 sleep·mock·검증 생략 없이 집중 account와 최종 전체 browser가 통과했습니다. 이는 격리 테스트 인프라 수정이며 UI 제품 결함으로 분류하지 않았습니다.

U15의 최신 outcome 미표시는 실제 제품 결함으로 controller에게 넘겨 별도 수정·리뷰 후 다시 검증했습니다. Task 4가 backend/UI 제품 코드를 임의로 수정하지 않았습니다.

Trace·video·screenshot은 off이며 `preserveOutput: 'never'`로 실패 DOM context도 남기지 않습니다. `test-results/.last-run.json` 실행 marker만 남고 자격 증명/개인 결과 artifact는 없습니다. 실제 Chrome 측정은 DOM만 사용했습니다. 소스 diff·타입·lint와 assertion을 자체 점검했고, 미해결 코드 정확성 우려는 없습니다.

## 운영 반영 대기와 인계

이 기록은 코드 검증 완료를 뜻합니다. 운영 링크 [한빛학교 배움터](https://hanbit.thisis-joe.com)의 학생 학습 UI 배포 완료를 뜻하지 않습니다.

Controller는 모든 task의 독립 리뷰와 `027b4ec`부터 확정 HEAD의 가장 강한 전체 리뷰를 마친 뒤, 기존 `hanbit-prod` / `.env.prod.local` / `infra/compose.prod.yml` / DB volume / Cloudflare tunnel을 그대로 사용합니다. 확정 HEAD의 backend/web build와 기존 DB backup 후 `up --no-build -d --wait`로 교체하고 외부 HTTPS login/signup/staff/API/asset과 실제 학생 학습 화면을 확인합니다. Volume 삭제, migration repair, 기존 사용자 행 변경을 하지 않습니다.

Controller가 실측 배포 결과를 전달하면 이 문서에 실행 SHA·명령·외부/브라우저 결과를 append하고 docs-only 작업 단위 commit·scoped review합니다. 코드 수정이 필요하면 해당 구현 task의 검증·리뷰 후 다시 배포합니다. 현재 작업트리와 feature branch는 tunnel bind 때문에 보존합니다. Task 4 검증 commit은 `test: verify student learning ui end to end`이며 정확한 SHA는 Git 이력과 Task 4 보고서에 기록합니다.
