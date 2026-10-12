# 학습 코어 백엔드 검증 기록

계획 기준일: 2026-10-12. 최종 실행일: 2026-10-13 (Asia/Seoul).
브랜치: `feat/learning-core`. Task 10 검증 시작 커밋: `af9eb83f039ff0a5b285c5795b5da33eab4492d1`.

## 완료 범위

승인된 [설계 L01~L14/A01~A14](../superpowers/specs/2026-10-12-learning-core-design.md)의 콘텐츠·저장·학생 API·서버 타이머·첫 답변/반복 풀이·진행·개인 목록·XP·보안 계약을 검증했다. 기존 계정·학급·교직원 백엔드와 프런트엔드 회귀도 실행했다. Task 10은 실제 HTTP 테스트, 교사용 응답의 개인정보 회귀, README와 이 기록만 변경했으며 생산 코드 수정은 필요하지 않았다.

이는 백엔드 API 완료다. 학생 문제/피드백/결과/개인 목록 화면, 보상 아이템·아바타·장비·지도, 랭킹·연속일, 교사 학습 통계 UI는 구현하거나 완료 검증하지 않았다. 브라우저 탭 숨김·다른 앱 이동 자체를 자동화한 학습 UI 테스트도 없다. 그 상황에 사용할 서버 deadline·재개 계약을 실제 네트워크와 DB로 검증했다. 계정 Playwright E2E와 운영 배포는 이번 최종 명령에 포함하지 않았다.

## 정본과 기동 무결성

| 항목 | 실제 확인 값 |
| --- | --- |
| 리소스·버전 | `backend/src/main/resources/content/hanbit-v1.json`, `hanbit-v1` |
| 원본 길이·SHA-256 | 30,939 bytes · `c59de1f6028f4669a41c60c9eee573ae8c4e7ec08c7350036512d2dac638a698` |
| 정규화 길이·SHA-256 | 29,590 bytes · `775b8cd7314ecfad9f93ad0ced97d4ca956093ae48b148d4fa438959214dfaeb` |
| 구조 | 30회×5문항, ID 1~150 연속·유일, `id=(day-1)*5+position` |
| 선택·원문 | O=87(사실), X=63(해석); 제목·원문·해설 nonblank/NFC |
| 시간 계산 | Java 21 `Character.isWhitespace` 제외 코드포인트; 0~12/13~16/17~20/21~25/26~31/32+ → 10/11/12/13/14/15초 |

최종 전체 실행의 `HanbitContentResourceTest.approvedResourceHasCanonicalBytesAndLearningStructure`와 `ContentDigestTest`가 승인된 상수를 검증했다. 별도 Ruby JSON 파싱·명시적 필드 순서 재구성·SHA-256 계산에서도 위 두 길이/해시, 30×5, ID 배열, O/X 개수를 확인했다. 원본 파일은 이번 작업에서 변경하지 않았다.

`ContentBootstrap`는 ApplicationRunner에서 `ContentImporter.install`을 호출한다. 신규 버전은 version 1행, day 30행, question 150행을 원자적으로 설치하고 정상 재시작은 쓰기 없이 검증한다. 다른 해시, 비활성 정본, 다른 활성 버전, 같은 해시지만 누락/변조된 행은 예외로 기동을 중단한다. 자동 수리나 덮어쓰기는 하지 않는다. `failedInstallLeavesNoVersionRows`는 실제 PostgreSQL INSERT trigger 오류로 후반 쓰기를 실패시켜 전부 롤백되는 것을 검증했다.

## 시간·진행·XP·개인 목록 계약

날짜 상한은 `clamp(DAYS.between(classroom.startDate, 서버의 Asia/Seoul 날짜)+1, 0, 30)`이다. 가장 앞선 미통과 회차를 통과해야 다음 회차를 시작하며 밀린 회차는 날짜 상한까지 같은 날 순서대로 따라잡는다. FIRST는 미답변 문항, REPLAY는 회차의 다섯 문항 전체, REVIEW는 활성 다시 볼 문제에서 고른 순서를 고정 저장한다. 학생당 미완료 세션은 하나다.

현재/마지막 문항의 `deadlineAt`과 시도 연속값은 저장되어 새로고침·새 로그인·기기 변경으로 초기화하지 않는다. 새 deadline·저장/응답 시각은 DB에 쓰기 전에 마이크로초로 내린다. 답변은 잠금을 기다리기 전에 주입 Clock에서 잡은 원시 `receivedAt`을 비교한다. `receivedAt == deadlineAt`은 유효하고 `+1ns`는 선택을 버린 timeout(`choice=null`)이다. 만료 후보 조회도 엄격한 마감 뒤 조건을 유지하며 소수 마이크로초는 조회 cutoff를 올림 처리해 DB 정밀도로 +1ns를 잃지 않는다. 확정의 비교값은 계속 원시 시각이다.

다섯 번째 답변 트랜잭션이 `PASSED`(3~5개 정답) 또는 `RETRY_REQUIRED`(0~2개), 최초 통과, 다음 회차 가능 여부와 XP를 함께 저장한다. 최종 advance/`완료하기` 없이 나가도 결과가 복원된다. FIRST의 catch-up 분류는 시작 시 고정되어 서울 자정을 넘어도 XP 기준을 바꾸지 않는다. REPLAY 최초 통과는 다섯 번째 확정 시점의 날짜 상한으로 catch-up을 다시 판정한다.

| 지급 원인 | 당일 | 밀린 회차 |
| --- | ---: | ---: |
| 첫 오답·timeout | 375 | 374 |
| 첫 일반 정답 | 565 | 564 |
| 첫 3연속 정답 문항 | 940 | 939 |
| 첫 5연속 정답 문항 | 1315 | 1314 |
| 최초 회차 통과 | 1125 | 1124 |
| REPLAY/REVIEW 답변 | 1 | 1 |

밀림 차감은 구성 요소마다가 아니라 최종 첫 답변/통과 지급액에서 정확히 한 번이다. 다섯 번째 응답 `xpAwarded`에는 그 트랜잭션의 통과 보너스도 포함한다(당일 5연속 FIRST 2440, 당일 재도전 최초 통과 1126). 5연속에 3연속 보너스를 중복하지 않는다. 원장 규칙은 `learning-v1`, 누적 XP는 학생별 원장 `long` 합계, 레벨은 `floor(totalXp/3750)+1`이다. 레벨 int 범위를 넘으면 wrap 대신 명시적으로 실패하는 정책 테스트도 실행했다.

첫 답변은 학생·버전·문항당 불변 사실이다. 반복 시도는 별도 사실을 저장하고 최근 답변만 갱신한다. 첫 오답·timeout은 AUTO 다시 볼 문제를 만든다. 반복 정답은 mastery를 최초 한 번 기록하고 AUTO만 해제한다. 이후 오답·timeout도 첫 정답/mastery를 지우지 않는다. 과거 정답/mastery가 있고 최신 상태가 오답/timeout이며 활성 USER 항목이 없을 때만 수동 등록을 제안한다. 동의 PUT은 USER를 생성하거나 해제된 항목을 승격/재활성화하고, USER는 이후 정답으로 자동 해제하지 않는다. 명시적 DELETE가 해제하며 반복 DELETE는 최초 해제 시각을 보존한다. 해제 후 조건을 다시 만족하면 현재 상태로 재동의할 수 있고 추가 새 답변 시각 조건은 없다. 별표는 이 상태들과 독립적이다.

## HTTP·보안·원자성

`LearningHttpIT`는 RANDOM_PORT Spring Boot와 실제 PostgreSQL을 사용한다. 각 JDK HttpClient에 독립 CookieManager를 두고 `csrf → student login → status → start → answer → 두 번째 로그인 → GET`을 실제 네트워크로 실행했다. 두 로그인 쿠키가 다름을 확인한 뒤 같은 sessionId·문항·deadline·저장된 AnswerResult 전체를 복원하고 두 번째 기기에서 재전송/advance 후 첫 기기의 같은 결과도 확인했다. 테스트 시각은 주입 MutableClock으로 이동하며 임의 sleep이나 모의 학습 응답을 사용하지 않는다.

익명은 401, 교사·관리자는 403이며 학생 API의 status/session/세 필터와 모든 POST/PUT/DELETE를 확인했다. 로그인과 학습 쓰기는 누락/잘못된 CSRF를 403 `INVALID_CSRF_TOKEN`으로 거절한다. 다른 학생의 read/answer/advance는 활성 문항과 피드백 단계 모두 404이고 없는 UUID와 같은 오류 JSON을 반환한다. 차단된 요청 전후 12개 학습 테이블의 전체 행 값이 같아 상태/XP/멱등 snapshot을 변경하지 않았음을 확인했다.

답변 전 status/start/GET/advance 결과는 `correctChoice`, `explanation`, `answer`를 포함하지 않는다. QUESTION_ACTIVE의 낡은 저장 피드백도 노출하지 않는 기존 회귀가 전체 실행에 포함됐다. 실제 첫 오답→복습 정답→나중 오답→수동 USER·별표 등록 후 학생 목록에 mastery/bookmark/latest outcome이 존재함을 확인했다. 담당 교사·학교 열람 교사·관리자의 학급/학교 학급/명단과 공개 학교/학급 응답은 등록 전후 동일하고 `reviewQueue`, `mastery`, `privateBookmark`, `bookmarked`, `lastAnswer`, `lastOutcome` 및 관련 내부 이름/사실 UUID를 포함하지 않는다. `ClassroomAccessIT`도 실제 private bookmark·최근 답변을 추가해 기존 DTO 불변을 검증한다. 교사용 생산 DTO/쿼리는 변경하지 않았다.

`server.servlet.session.cookie.secure=false`는 HTTP인 `LearningHttpIT`의 annotation에만 있다. 공유 테스트 YAML에 추가하지 않았다. `ProductionCookieIT.productionCookieIsSecure`는 생산 기본 HttpOnly·Secure·SameSite=Lax와 CSRF 응답 no-store를 실제 HTTP로 확인했다.

같은 학생·작업·requestId의 의미상 같은 payload는 첫 JSON 응답의 모든 필드를 snapshot에서 재생한다. 필드 순서와 JSONB key 순서는 무관하고 다른 payload는 409 `IDEMPOTENCY_KEY_REUSED`다. 시작/답변/advance의 작업 namespace는 독립적이다. 재전송은 추가 답변·XP·통과를 만들지 않는다. 학생 profile/session 행 잠금과 답변/원장 유일 키, 같은 트랜잭션의 진행/피드백/최근 답변/mastery/queue/snapshot이 중복·부분 저장을 방지한다. 경합 및 주입된 후반 쓰기 실패는 실제 PostgreSQL로 확인했다. 실패 복구 읽기는 쓰기 롤백 후 별도 REQUIRES_NEW에서 수행한다.

## 마이그레이션과 주기 처리

| 버전 | 파일 | 책임 |
| --- | --- | --- |
| V1 | `V1__account_classroom.sql` | 계정·학교·학급·학생 소속 |
| V2 | `V2__learning_content.sql` | 콘텐츠 버전·회차·정본 문항 |
| V3 | `V3__learning_sessions.sql` | 진행·세션·문항 순서·회차 시도·멱등 응답 |
| V4 | `V4__learning_answers_xp.sql` | 첫 답변·최근 답변·XP 원장 |
| V5 | `V5__learning_replay.sql` | 독립 반복 답변 |
| V6 | `V6__learning_review_mastery.sql` | mastery·자동/수동 다시 볼 문제 |
| V7 | `V7__learning_bookmarks.sql` | 개인 별표 |

최종 `LearningHttpIT` XML 로그에 PostgreSQL **17.11**, `Successfully validated 7 migrations`, V1부터 V7까지 각각 적용, `Successfully applied 7 migrations … now at version v7`, JPA EntityManagerFactory 초기화가 있다. `application.yml`은 `ddl-auto=validate`, 통합 환경은 `PostgresTestConfiguration`의 `postgres:17`이다. 실제 FK/CHECK/유일 제약·잠금·롤백 테스트 211개가 같은 최종 실행에 포함됐다. 콘텐츠/학습 FK는 삭제 NO ACTION이며 부모 삭제로 이력을 묵시적으로 지우지 않는다.

운영 기본 설정은 `hanbit.learning.expiry-enabled=true`, `expiry-delay-ms=1000`, `expiry-batch-size=100`이다. scheduler는 Clock을 주기당 한 번 읽고 `QUESTION_ACTIVE`의 엄격한 마감 뒤 후보를 deadline·UUID 순으로 최대 batchSize만 처리한다. processor는 세션마다 REQUIRES_NEW에서 공유 finalizer를 실행하고 잠금 후 현재 문항/마감으로 안정적인 synthetic UUID를 만든다. 한 후보 오류는 해당 쓰기를 롤백하고 다음 후보를 처리하며 로그에는 예외 클래스만 남긴다.

Gradle test JVM은 `hanbit.learning.expiry-enabled=false`로 다른 테스트의 시간을 안정적으로 제어한다. `ExpiredAnswerSchedulerIT`만 enabled=true/delay=50으로 실제 예약 Runnable을 최소 두 주기씩 관찰하고 +1ns timeout 후 재실행에도 사실/XP/피드백이 유지되는지 확인했다. 두 worker/클라이언트 경합은 `LearningConcurrencyIT`에서 검증했다.

이 기능 브랜치의 재검증에서 V2/V3 기존 정의를 보강했다. 이전 체크섬을 이미 기록한 영구 DB는 그대로 적용할 수 없으며 배포 전 별도의 전진 마이그레이션 전략이 필요하다. 이번 실행은 신규 Testcontainers DB 대상이며 운영 DB/배포/마이그레이션 repair를 수행하지 않았다.

## 최종 실행 증거

도구: OpenJDK **21.0.11**(Homebrew), Gradle Wrapper **8.14.6**, Spring Boot **4.1.1**, Docker client **29.6.0**/server **29.5.2**, PostgreSQL image **postgres:17**(관찰값 **17.11**), Node **v24.21.0**, pnpm **11.25.0**. 아래 명령은 저장소 루트에서 실행했다.

```sh
./backend/gradlew -p backend test --tests '*LearningHttpIT' --tests '*ClassroomAccessIT' --tests '*ProductionCookieIT'
./backend/gradlew -p backend clean test
npx --yes --package=node@24 --package=pnpm@11.25.0 -c 'node --version && pnpm --version && pnpm --dir frontend test && pnpm --dir frontend build && pnpm --dir frontend lint'
```

| 실행 | 실제 결과 |
| --- | --- |
| 최종 HTTP 집중 | exit 0, `BUILD SUCCESSFUL in 14s`; 12 tests / 0 failures / 0 errors / 0 skipped (HTTP 6, classroom 5, production cookie 1) |
| clean 전체 백엔드 | exit 0, `BUILD SUCCESSFUL in 2m 11s`; 29 suites, **559 tests / 0 failures / 0 errors / 0 skipped**; clean/compile/resources/tests 모두 실행 |
| 고정 프런트엔드 test | exit 0, Vitest 5.0.3, **8 files / 30 tests passed**, 2.06s |
| 고정 프런트엔드 build | exit 0, `tsc -b` 및 Vite 8.3.4, **87 modules transformed**, production build 성공 |
| 고정 프런트엔드 lint | exit 0, `eslint .`, 진단 없음 |

최종 백엔드 클래스별 실행 수는 content 119, learning(하위 XP 포함) 401, 기존 계정·학급·교직원/기타 39로 합계 559다. content와 learning을 더한 값에는 중복이 없다. HTTP 집중 결과는 전체 실행에도 다시 포함됐다. 첫 집중 시도는 테스트의 School 패키지 import 오류로 컴파일에 실패했고 import만 수정했다. 이후 집중 실행 두 번과 최종 clean 실행은 모두 위처럼 통과했으며 생산 결함 RED로 주장하지 않는다. 기존 기능에 대한 새 회귀 테스트가 즉시 통과했으므로 생산 변경은 하지 않았다.

전체 로그와 JUnit XML은 ignored `.superpowers/sdd/2026-10-12-learning-core/rerun-task-10-{focused,clean-backend}-results/` 및 대응 `-focused-final.log`, `-clean-backend.log`, `-frontend.log`에 보존했다. 테스트 수는 JUnit XML의 tests/failures/errors/skipped를 합산했다. 일반 JVM CDS 경고와 예상 제약/trigger 거절 로그는 있지만 실패·오류·건너뛴 테스트는 없다. 전역 Node, 프런트엔드 소스와 잠금 파일은 변경하지 않았다.

## L01~L14 근거

아래는 최종 전체 명령에서 실행한 실제 클래스·메서드 이름이다. 긴 이름은 `클래스.메서드`로 표기한다.

| ID | 요구사항 | 이름 있는 테스트 |
| --- | --- | --- |
| L01 | 정본 150문항·30×5·원문/해설 | `HanbitContentResourceTest.approvedResourceHasCanonicalBytesAndLearningStructure` |
| L02 | 서울 날짜 상한 | `LearningCalendarTest.currentDateChangesAtSeoulMidnight`, `calendarCapIsClampedBeforeStartAndAfterDayThirty`; `LearningSessionIT.rejectsFutureAndSkippedFirstDaysWithStableErrors` |
| L03 | 가장 앞선 미통과부터 | `LearningSessionIT.rejectsFutureAndSkippedFirstDaysWithStableErrors`; `DayCompletionIT.atMostTwoCorrectAnswersRequireRetryAndKeepTheNextDayBlocked` |
| L04 | 같은 날 순차 따라잡기 | `DayCompletionIT.catchUpCanPassSequentialDaysUntilCalendarCap` |
| L05 | 3/5 통과·0~2 재도전 | `DayCompletionIT.threeCorrectAnswersPassAndUnlockTheNextDayWithoutFinalAdvance`, `atMostTwoCorrectAnswersRequireRetryAndKeepTheNextDayBlocked` |
| L06 | 다섯 번째 저장·완료 버튼 불필요 | `DayCompletionIT.threeCorrectAnswersPassAndUnlockTheNextDayWithoutFinalAdvance`, `expiryOfTheFifthQuestionAlsoCommitsCompletionAndThePassBonus` |
| L07 | 첫 답변 불변 | `LearningPersistenceContractIT.mergingAReplacementCannotRewriteTheFirstAnswerFact`; `LearningReplayIT.retryPassPreservesFirstFactsAndWritesFiveIndependentOneXpRepeatFacts` |
| L08 | 다섯 문항 재도전·첫 통계 유지 | `LearningReplayIT.retryPassPreservesFirstFactsAndWritesFiveIndependentOneXpRepeatFacts`, `replayPassThresholdIsThreeAndFailedRetriesCanStartFreshAttempts` |
| L09 | 나중 오답에도 과거 정답/mastery 유지 | `LearningReviewIT.replayCreatesMasteryOnceAndLaterWrongOrTimeoutPromptsWithoutEnqueuing` |
| L10 | 동의 수동 등록·직접 해제 | `LearningQuestionListIT.firstCorrectThenLaterWrongOrTimeoutInsertsUserAndCorrectnessNeverReleasesIt`, `releasedAutoPromotesToUserAndExplicitRemovalAndNewConsentReactivateIt` |
| L11 | 첫 오답 AUTO·별표 독립·교사 비공개 | `LearningReviewIT.firstWrongAndTimeoutActivateAutoWhileFirstCorrectDoesNot`; `LearningQuestionListIT.bookmarksAreIndependentIdempotentAndSurviveLogoutAndAnotherDevice`; `LearningHttpIT.staffAndPublicClassroomResponsesOmitEveryPrivateLearningField` |
| L12 | 서버 deadline·재개 | `LearningHttpIT.secondAuthenticatedDeviceRestoresTheSameQuestionDeadlineAndPersistedFeedback`; `LearningSessionIT.resumePreservesTheStoredMicrosecondDeadlineAndStartCatchUpAcrossMidnight` |
| L13 | 동일 재전송·중복 방지 | `LearningConcurrencyIT.sameRequestRetryAcrossDevicesReturnsTheExactSnapshot`; `LearningAnswerIT.answerRetryReturnsOriginalXpSnapshotAndRejectsChangedChoiceBeforePhaseChecks`; `DayCompletionIT.completedAdvanceAndAnswerRetriesNeverMintASecondFirstPass` |
| L14 | 확정 전 정답/해설 비공개 | `LearningHttpIT.secondAuthenticatedDeviceRestoresTheSameQuestionDeadlineAndPersistedFeedback`; `LearningAccessIT.anActiveQuestionNeverExposesStalePersistedFeedback` |

## A01~A14 근거

| ID | 검증 상황 | 이름 있는 테스트 |
| --- | --- | --- |
| A01 | 정본·해시·기동 fail-fast | `HanbitContentResourceTest.approvedResourceHasCanonicalBytesAndLearningStructure`; `ContentBootstrapIT.differentHashFailsClosed`, `sameHashWithMissingOrChangedRowsFailsClosed`, `sameHashWithChangedRowsFailsClosedWithoutRepair`, `failedInstallLeavesNoVersionRows` |
| A02 | 12/13~31/32·공백·코드포인트 경계 | `QuestionTimeLimitTest.assignsSecondsAtEveryLengthBoundary`, `ignoresWhitespaceAndCountsUnicodeCodePoints` |
| A03 | 정답/오답/timeout·확정 후 해설 | `LearningAnswerIT.correctAnswerPersistsImmutableFactProjectionXpAndFeedbackAtomically`, `wrongAnswerStoresItsChoiceAndResetsTheAttemptStreak`, `oneNanosecondLateDiscardsEvenTheCorrectSubmittedChoice`; `LearningHttpIT.secondAuthenticatedDeviceRestoresTheSameQuestionDeadlineAndPersistedFeedback` |
| A04 | 답변·만료 경합 exactly once | `LearningConcurrencyIT.answerAndExpiryFinalizeExactlyOnce`, `twoWorkersUseOneStableTimeoutRequestAndOneFinalization`; `ExpiredAnswerSchedulerIT.realSchedulerRunsAtLeastTwoTicksAndTimeoutFactsAndFeedbackStayExactlyStable` |
| A05 | 다섯 번째 뒤 종료·저장/복원 | `DayCompletionIT.threeCorrectAnswersPassAndUnlockTheNextDayWithoutFinalAdvance`, `atMostTwoCorrectAnswersRequireRetryAndKeepTheNextDayBlocked`, `expiryOfTheFifthQuestionAlsoCommitsCompletionAndThePassBonus` |
| A06 | 3/5와 2/5 차이 | `DayCompletionIT.threeCorrectAnswersPassAndUnlockTheNextDayWithoutFinalAdvance`, `atMostTwoCorrectAnswersRequireRetryAndKeepTheNextDayBlocked` |
| A07 | 미래 차단·즉시 다음·상한 | `LearningSessionIT.rejectsFutureAndSkippedFirstDaysWithStableErrors`; `DayCompletionIT.catchUpCanPassSequentialDaysUntilCalendarCap`, `passingDayThirtyNeverUnlocksAnExtraDay` |
| A08 | 재도전 1 XP·첫 통과 한 번 | `LearningReplayIT.retryPassPreservesFirstFactsAndWritesFiveIndependentOneXpRepeatFacts`, `passedDayReplayNeverChangesThePassOrPaysAnotherBonus` |
| A09 | 당일/밀림 XP·레벨 | `XpPolicyTest.firstAnswerUsesTheExactFinalAmountForEachStreakAndCatchUpCombination`, `repeatAndFirstPassAmountsAreExact`, `levelUsesLongArithmeticAtEveryBoundary`; `DayCompletionIT.catchUpAwardsExactlyOneLessPerAnswerAndOneLessForTheFirstPass` |
| A10 | 새 로그인/기기·동일 상태/마감/연속 | `LearningHttpIT.secondAuthenticatedDeviceRestoresTheSameQuestionDeadlineAndPersistedFeedback`; `LearningAnswerIT.phaseSpecificLastAnswerAndPromptRecoverAcrossDevicesWithoutChangingDeadline`; `DayCompletionIT.midnightDoesNotReclassifyActiveFirstAttempt` |
| A11 | 같은 ID snapshot·다른 payload 409 | `LearningSessionIT.startIsJsonSemanticAndReplaysTheImmutableResponseSnapshot`; `LearningAnswerIT.answerRetryReturnsOriginalXpSnapshotAndRejectsChangedChoiceBeforePhaseChecks`; `LearningReviewIT.crossSessionAdvanceRaceRecoversOnlyTheIdempotencyPrimaryKeyAndRollsBackTheLoser` |
| A12 | 최근 오답 제안·동의·수동 유지 | `LearningReviewIT.priorCorrectFirstPromptsOnlyOnLaterWrongAndNeverCreatesAUserRow`; `LearningQuestionListIT.firstCorrectThenLaterWrongOrTimeoutInsertsUserAndCorrectnessNeverReleasesIt` |
| A13 | 첫 오답→복습 정답→재오답 | `LearningReviewIT.reviewUsesOneXpAndImmutableFirstFactsAndFirstCorrectMastery`, `replayCreatesMasteryOnceAndLaterWrongOrTimeoutPromptsWithoutEnqueuing` |
| A14 | 타 학생·교사 privacy | `LearningHttpIT.otherStudentCannotReadOrMutateSession`, `staffAndPublicClassroomResponsesOmitEveryPrivateLearningField`, `unauthenticatedAndStaffClientsCannotUseStudentLearningRoutes`; `ClassroomAccessIT.teacherRosterClassroomAndPublicDtosNeverRevealPrivateQueueOrMastery`; `LearningQuestionListIT.studentIdSpoofingCannotReadOrMutateAnotherStudentsLists` |

추가 보안/원자성 근거: `LearningHttpIT.missingAndInvalidCsrfRejectLearningWritesWithoutAnyMutation`, `loginRequiresCsrfBeforeAuthenticatingTheNetworkClient`, `ProductionCookieIT.productionCookieIsSecure`, `LearningAccessIT.brokenStudentContextFailsBeforeWrite`, `LearningAnswerIT.rawReceivedAtIsCapturedBeforeWaitingForTheSessionLock`, `DayCompletionIT.fifthAnswerFailureRollsBackEverything`, `LearningConcurrencyIT.constraintRecoveryUsesADistinctNewReadTransactionOnlyAfterTheWriteRolledBack`가 최종 실행에 포함됐다.

## Task 1~9 커밋 이력

아래는 현재 브랜치의 실제 git log에서 확인한 전체 구현/재검증 보강 이력이다. Task 1~4 재검증은 기존 구현 커밋을 보존하고 별도 작업 단위 커밋을 추가했다.

| Task | 실제 커밋 SHA |
| --- | --- |
| 1 콘텐츠 | `6546fd091429288ce4318213568bff8192b93c62`, `0ebaa6e2a95473ab1f09c577c2e293ab2bd404a7`, `b85db0d862c35ccd39ec060a2f7040b4a9aee5b2`, `a6fac45736ee97e178031d78ade854957a0b379c` |
| 1 공통 FK/Clock 보강 | `606a7f7989dcdbabf707238cec7a95f523f373e1`, `105f76262f2fb4d844d771b6e20a88f6b61664b5` |
| 2 진행·세션 저장 | `e93c2f1b6ee5f7752394097b5e916cee2f7e47f7`, `d68fc13ae529182309fb8da1eb10788b87ff7dff`, `c99fa9e670317107bc20aed58b8ae335d59f118f`, `6ef7e38dd737a3e9cac940ab765d7971c94ea44c` |
| 3 답변·XP 계약 | `6b9be6fc60dcab1abd2ff91ede50b955f222ac49`, `6d502101207a937d3f12cfe7a826a13561195787` |
| 4 시작·재개·접근 | `b4c4bd33993ec3e6e90300f0e20ba600d3f1c69b`, `ebb839fbd105b17a0b390806b8a9eebea511cfef`, `037cac3aba0ba2229382a16720c4efecdf35988b`, `ec1c0b1cacdf8eb9e98e3833e54e8cd2a35ecc62`, `a8b183efe15157f8cd37a9bff901a11edecdf40e` |
| 5 시간 판정·원자 확정 | `72a9cee35b2f08253eb9af03a7792db88ff738dc` |
| 6 REPLAY·재도전 | `fdb5598ab3b396466ef149eea9e17201638d7e32` |
| 7 REVIEW·mastery·자동 queue | `50b76b86789c014c9ecef337e0c51014746db0e5`, `9a0087a71a85f9e0982d62b89b6d0c2bbf758d9f` |
| 8 개인 목록·수동 queue·별표 | `996be9fae7c6607e80d949633473416c4f1d46de` |
| 9 주기 만료·경합 | `af9eb83f039ff0a5b285c5795b5da33eab4492d1` |

후속 branch 전체 리뷰와 병합/배포는 별도 게이트다. 이 문서는 위 실제 최종 실행 결과와 현재 구현 계약의 근거를 기록한다.
