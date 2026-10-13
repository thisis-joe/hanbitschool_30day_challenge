# 학생 학습 UI 실행 검증

2026-10-13 KST, 이 문서는 Task 4의 학생 학습 UI 실행 기록과 이후 수정·재검토·운영 반영을 함께 기록합니다. Task 4 당시 검증 소스 `218d874`는 frontend 146 tests, backend 559 tests, 전체 Chromium 17개 사례를 통과했습니다. 이후 최종 수정과 재검토, 한정된 인증 경계 수정, scoped review를 거쳐 정확한 소스 `82c987cfb763245ab103704e0fc5759569675ee6`을 같은 운영 링크에 배포하고 실제 학생 흐름을 확인했습니다. 아래 각 단계의 수치와 판정은 해당 시점·범위의 근거이며, 과거 실패와 당시 열려 있던 finding도 그대로 구분해 보존합니다.

## 최신 수정·재검토 gate

이후 product HEAD `17253958042acf3509f82f79bb6ec26a463025da`에 수정 커밋 `8e91211`, `2742014`, `1725395`가 추가됐습니다. 당시 focused frontend 회귀는 64 tests 통과, 전체 frontend는 18 files / 158 tests 통과, build와 lint도 exit 0이었습니다. 실제 Chromium은 17개 사례가 50.4초에 통과했습니다. backend 29 suites / 559 tests 결과는 변경되지 않아 Task 4 실행 결과를 재사용했고 이 fix wave에서는 재실행하지 않았습니다. 이 수치와 다음 단락의 open finding은 당시 상태를 설명하며, 이후 경계 수정·리뷰·배포로 해결됐습니다. 세부 실행 결과는 `final-fix-report.md`에 기록되어 있습니다.

당시 scoped re-review는 Task 4의 원래 네 finding을 모두 ADDRESSED로 판정했지만 새 Important/P2 문제도 확인했습니다. 초기 익명 상태의 `/me` 요청이 로그인 POST와 겹치면 그 `/me`의 401이 계정 epoch를 바꿔 성공 로그인 200을 AbortError로 폐기할 수 있었습니다. 관찰된 화면은 연결 오류를 표시했고 두 번째 로그인이 성공했습니다. 당시 넓은 frontend/browser suite는 이 경합을 다루지 않았으므로 그 통과 결과만으로 출시 준비를 주장하지 않았습니다. 이 발견은 당시 기준 `final-rereview-report.md`에 보존되어 있습니다.

이후 사람의 프로세스 판정으로 SDD 최종 수정 wave 한도의 한정된 예외가 기록됐습니다. 이는 승인된 제품 범위를 넓힌 것이 아니라 이미 허가된 학생 로그인 목표를 완료하기 위한 경계 수정·리뷰 절차 예외였습니다. 초기 또는 이미 익명인 `/me`의 저장소 정리를 실제 인증된 owner 이탈의 epoch 전환과 분리했고, 실제 owner 이탈·오래된 owner 응답 방어는 유지했습니다. 세부 수정은 다음 단락에 기록합니다.

경계 수정 커밋 `82c987c`는 초기·이미 익명인 `/me`의 401에서 pending-command 저장소를 정리하되 익명 epoch와 진행 중 로그인 요청을 유지합니다. 실제 accepted-owner 이탈과 명시적 계정 수락은 기존 epoch·cache cleanup을 계속 사용합니다. 네 회귀 사례에서 RED 4 failed / 5 passed였고, covering frontend 5 files / 49 passed였습니다. 이후 전체 frontend는 18 files / 162 passed, build와 lint exit 0, isolated Chromium 17개가 57.6초에 통과했습니다. backend 559 결과는 그대로 재사용하고 재실행하지 않았습니다. Fresh scoped review는 P2를 ADDRESSED로 판정했고 추가 Critical/Important breakage 없이 spec PASS / quality APPROVED였습니다. 근거는 `anonymous-boundary-report.md`와 `anonymous-boundary-review.md`입니다. 검증된 product HEAD는 `82c987cfb763245ab103704e0fc5759569675ee6`입니다.

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
| U01 | Task 4 당시 로그인 학습 홈·계정·로그아웃 및 account/role-switch E2E, `studentPasswordChangeLandsOnLearningHome`, `studentEndpointsRequireAStudentLoginAndCsrf`. 지연된 초기 anonymous `/me` 401/로그인 200 경합은 당시 매핑이 검증하지 못해 P2로 열렸으나 실제 App/login 회귀와 scoped review에서 ADDRESSED. 배포 smoke에서 첫 로그인은 학습 홈에 도달했고 logout은 로그인으로 돌아감. |
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
| U16 | Task 4 당시 `accountSwitchClearsCache`, `switchingStudentsDoesNotRenderPreviousLearningData`, `latePreviousAccount401DoesNotClearTheNewStudentsPendingCommand`, `accountChangeAbortsReadsAndIgnoresLateMutationCompletion`, logout/401 정리와 역할 전환 E2E는 해당 사례에서 통과. 이후 초기 익명 `/me`·로그인 경합은 경계 수정의 실제 App RED/GREEN와 scoped review에서 해결됐고, 운영 smoke에서 logout 뒤 보호된 home/private heading이 보이지 않음을 확인함. |
| U17 | 360/1280px 대표 home/question/feedback/result/private-list DOM overflow ≤0, 모든 측정 header/학습 버튼·링크·checkbox label ≥48px; Tab/Enter 제출·보이는 outline·새 문항/해설/result heading focus. Countdown live attribute 없음 확인, reduced-motion CSS 검토 |
| U18 | Task 4 당시 실제 PostgreSQL/Chromium 학습과 기존 계정·교직원 포함 17 E2E, backend 559·frontend 146·build/lint 통과. 이후 `1725395`의 158/17-browser 결과 당시에는 새 P2가 열렸으나 `82c987c`에서 해결·scoped review 승인. Ready source frontend 162/162·build/lint와 Chromium 17/17 (57.6s), backend 559 재사용 후, 정확한 SHA `82c987cfb763245ab103704e0fc5759569675ee6`를 10:03–10:08 KST에 같은 HTTPS 링크에 배포하고 API·asset·실제 학생 학습/저장·목록·logout을 확인함. 현재 상태는 이 문서의 운영 반영 결과 절에 기록. |

## 실행 중 수정과 근거

테스트 정본 JSON root를 object로 잘못 읽은 import, 다섯 번째 응답 XP 범위, protected-route logout의 `returnTo` query는 테스트 작성 오류로 바로잡았습니다. 구현 누락의 RED로 보고하지 않았습니다.

처음 전체 browser 실행은 **17 failed / 0 passed / 0 skipped**, exit 1이었습니다. 기존 account test의 동시 `restart backend web` 동안 Nginx가 backend DNS보다 먼저 시작하여 `host not found in upstream "backend"`로 종료됐습니다. 첫 account case의 90초 readiness 실패 이후 나머지 16개는 연결 거절이었습니다. Controller가 account test 범위 확장을 승인한 뒤 두 restart/recreation site 모두 **backend → 실제 Docker healthy → web → 공개 HTTP 200** 순서로 고쳤습니다. 임의 sleep·mock·검증 생략 없이 집중 account와 최종 전체 browser가 통과했습니다. 이는 격리 테스트 인프라 수정이며 UI 제품 결함으로 분류하지 않았습니다.

U15의 최신 outcome 미표시는 실제 제품 결함으로 controller에게 넘겨 별도 수정·리뷰 후 다시 검증했습니다. Task 4가 backend/UI 제품 코드를 임의로 수정하지 않았습니다.

격리 E2E trace·video·screenshot은 off이며 `preserveOutput: 'never'`로 실패 DOM context도 남기지 않습니다. 격리 실행에는 `test-results/.last-run.json` marker만 남았습니다. 운영 smoke에서는 합성 계정의 학습 홈 화면만 캡처했으며 자격 증명이나 개인 결과 화면은 캡처하지 않았습니다.

## 운영 반영 결과

학생 학습 UI는 승인된 동일 링크 [한빛학교 배움터](https://hanbit.thisis-joe.com)에 product HEAD `82c987cfb763245ab103704e0fc5759569675ee6`로 2026-10-13 10:03–10:08 KST에 배포했습니다. 검증 범위는 이 SHA의 backend/web 배포, 외부 HTTPS와 실제 합성 학생 흐름입니다.

### 배포 절차와 보존 상태

운영 compose 설정은 `config --quiet` exit 0으로 확인했고 `.env.prod.local` 권한은 600이었습니다. 직전 custom `pg_dump` 백업은 `/Users/Joseph/.hanbit-prod-ui-backup.Hg22v5/hanbit-prod-before-ui.dump`에 저장됐으며 71,798 bytes, 파일 권한 600, 디렉터리 권한 700입니다. 원본 컨테이너 아카이브와 호스트 복사본 모두 `pg_restore --list` catalog validation에 성공했습니다. 이는 archive 목록 판독 확인이며 restore rehearsal은 아닙니다.

실행한 backend/web 배포 명령은 다음과 같고 각각 exit 0입니다.

```sh
docker compose -p hanbit-prod --env-file /Users/Joseph/workspaces/hanbitschool_30day_challenge/.env.prod.local -f infra/compose.prod.yml config --quiet
docker compose -p hanbit-prod --env-file /Users/Joseph/workspaces/hanbitschool_30day_challenge/.env.prod.local -f infra/compose.prod.yml build backend web
docker compose -p hanbit-prod --env-file /Users/Joseph/workspaces/hanbitschool_30day_challenge/.env.prod.local -f infra/compose.prod.yml up --no-build --no-deps -d --wait --wait-timeout 120 backend web
```

배포 후 backend는 healthy, web은 running이며 두 서비스 restart count는 0입니다. 기존 DB container `076b39c8cebd98e3574128354eb371f560ba80a127f3bf6ccd56176b755cf993`, tunnel container `a5c23cf34de7517260e9ba37bdb4a1bbba8151e4284e1f735d94356a0339c5be`, DB volume `hanbit-prod_school-data`, tunnel의 기존 bind mounts는 보존됐습니다. DB/tunnel은 재생성하지 않았습니다. 시작 로그에서 Flyway 7개 migration을 검증했고 schema가 up-to-date라 추가 migration은 없었습니다. 실행 backend image `sha256:34540ed30dd97cc31919a83fb6b7996032ae4e224a15a4d847f07b07e8ff3f45`와 web image `sha256:1ccf5021e96d5bd75916d35f490a48c8f8a644d941b1cccc99f93741fa369c0a8`은 현재 `verified-student-ui-20261013` recovery tag에도 지정되어 있으며 tag와 실행 이미지 ID가 일치합니다. 실행 JAR SHA-256 `5dbbc9dddd7d4ce0211e7902762467bf08097d4488b8508340538cafe8a135c2`는 이전 learning-core 배포와 같습니다.

이전 pre-UI backend/web image ID는 교체 후 더 이상 resolve되지 않아 해당 ID를 바로 재태그할 수 있다고 주장하지 않습니다. 기존 DB 백업은 유지되고 이전 source `027b4ec`는 Git에 남아 있으며, 현재 정상 동작이 확인된 이미지에는 위 recovery tag가 지정되어 있습니다. `down`, restore, volume 삭제, image prune, migration repair, 기존 사용자 행 변경은 하지 않았습니다. Tunnel bind 때문에 이 worktree와 feature branch를 보존합니다.

### 외부 HTTPS와 번들 확인

외부 확인 9건은 exit 0이었습니다: `/login`, `/signup`, `/staff/login`은 200, 공개 학교 목록은 200이며 학교 1개, CSRF는 200과 `no-store`; HTTPS session cookie의 Secure, HttpOnly, SameSite=Lax flags는 모두 true였습니다. 익명 학생 learning endpoint는 401을 반환했습니다.

외부 HTML과 실행 중 container `index.html`의 asset 경로·바이트가 일치합니다. JS `index-CGnI7qzq.js` SHA-256은 `9a1a71c2e945fc6aed874e23b4311e376096ba645afb1fd867f90f4790c7e865`, CSS `index-Cf8g3lj4.css` SHA-256은 `3d0032272fc58b48f0211c5498dfcb26da3331e0a174212dbb6daac039d6b4c8`이며 외부에서 받은 파일과 container 파일이 각각 같은 hash였습니다. 최종 built bundle의 독립 검사는 canonical question 150개, JS bundle 1개, 원문·해설 일치 0건(`textMatches=0`, `explanationMatches=0`), exit 0을 반환했습니다. 검사한 asset은 외부 배포 asset과 바이트가 같습니다.

### 실제 학생 학습 smoke

HTTPS의 기존 authorized staff API 흐름으로 표시가 분명한 합성 학급과 학생을 한 번 생성했습니다. 기존 계정의 비밀번호를 재설정하지 않았고 명단을 SQL로 읽거나 쓰지 않았습니다. 지원되는 삭제 API가 없어 합성 fixture는 유지됩니다. 비밀값과 fixture 식별값은 이 문서에 기록하지 않습니다.

실제 학생 로그인은 첫 시도에 학습 홈으로 이동했습니다. 학생은 O/X 다섯 문항에 모두 정답을 제출했고 각 답의 feedback에 서버 XP가 보였습니다. 첫 bookmark는 feedback reload 뒤에도 유지됐습니다. 다섯 번째 답 뒤 완료 링크가 표시됐지만 이를 누르지 않고 홈으로 나갔습니다. 홈은 1/30 passed, 5/150 first answers, 5075 XP, level 2를 보였고, 저장 결과 화면은 5/5 PASS였으며 직접 열고 reload해도 복원됐습니다. 다음 날짜의 day는 date-locked였습니다.

개인 목록에서는 REVIEW_QUEUE 0개, MASTERED 0개, BOOKMARKED 1개가 나타났고, 북마크 문항은 최근 정답·복습 미완료·별표 상태가 각각 구분됐습니다. FIRST 정답으로 mastery가 만들어졌다고 추론하지 않았습니다. 로그아웃 후 로그인 화면으로 돌아왔고 보호된 학습 홈에서 private heading은 나타나지 않았습니다. browser console warning/error는 0건이었습니다. 360px viewport에서 콘텐츠 폭 345px(스크롤바 포함), 홈과 개인 목록의 가로 overflow 0, 측정 버튼 최소 48px였습니다. 임시 스타일 override는 복구했습니다.

배포 직후 smoke fixture 생성 전 aggregate counts는 accounts 1 / schools 1 / classes 1 / students 0으로 배포 전과 같았습니다. smoke 후 counts는 accounts 2 / schools 1 / classes 2 / students 1 / sessions 1 / first answers 5 / bookmarks 1입니다. 이 수치는 aggregate만 기록하며 실제 사용자 행이나 비밀값은 조회·공개하지 않았습니다.
