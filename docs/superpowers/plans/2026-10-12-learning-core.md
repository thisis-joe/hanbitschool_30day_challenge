# 한빛학교 학습 코어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 150문항을 서버 정본으로 등록하고, 학생별 30회 순차 진행·서버 타이머·첫 답변/반복 풀이·개인 문제 목록·멱등 XP를 실제 PostgreSQL 기반 API로 구현한다.

**Architecture:** 기존 account/classroom 모듈 옆에 versioned `content`와 transaction-centered `learning` 모듈을 둔다. 학생별 활성 세션과 현재 문항의 서버 `deadlineAt`을 영속화하고, 답변·최근 상태·회차 결과·XP 원장을 한 트랜잭션에서 확정한다. 반복 풀이 이력과 개인 목록은 첫 답변에서 분리하며, HTTP 재전송은 요청 payload 해시와 당시 응답 snapshot으로 재생한다.

**Tech Stack:** Java 21, Spring Boot 4.1.1, Gradle Wrapper 8.14.6, PostgreSQL 17, JPA, Flyway, Spring Security session/CSRF, Jackson, JUnit 5, AssertJ, MockMvc, Testcontainers `postgres:17`, Awaitility.

**Spec:** [학습 코어 설계](../specs/2026-10-12-learning-core-design.md). 실행자는 이 계획과 설계를 함께 읽으며, 충돌 시 설계를 우선한다.

## Global Constraints

- Java 21, Spring Boot 4.1.1, Gradle Wrapper 8.14.6을 유지한다.
- PostgreSQL 17, Flyway 버전형 migration, JPA `ddl-auto=validate`를 사용한다. 유일 제약·행 잠금·경합은 실제 PostgreSQL Testcontainers로 검증하며 H2로 대체하지 않는다.
- 콘텐츠는 `hanbit-v1`, 30회×5문항, ID 1~150이고 정규화 JSON SHA-256은 `775b8cd7314ecfad9f93ad0ced97d4ca956093ae48b148d4fa438959214dfaeb`이다.
- O는 사실, X는 해석이다. 정답과 해설은 답변 확정 전 어떤 학생 응답에도 포함하지 않는다.
- 학생 ID는 요청에서 받지 않고 `AccountPrincipal` → `StudentProfile` → `Classroom`으로 결정한다. `/api/student/**`는 STUDENT 역할과 모듈 내부 역할 검사를 모두 거친다.
- 새 `content`/`learning` 코드는 주입한 `Clock`, `Instant`/`timestamptz`, `LocalDate`/`date`를 사용하고 날짜 판정 zone은 `Asia/Seoul`로 고정한다. 이 두 패키지에서 `Instant.now()`나 `LocalDate.now()`를 직접 호출하지 않는다. 기존 account/classroom 생성시각 리팩터링은 범위 밖이다.
- PostgreSQL과 HTTP 재개의 시각 정밀도는 마이크로초로 맞춘다. 새 deadline과 저장/응답 시각은 DB에 쓰기 전에 `ChronoUnit.MICROS`로 내리되, 마감 판정은 내리지 않은 원시 `receivedAt`과 이미 마이크로초 정렬된 deadline을 비교하여 `+1ns`를 timeout으로 유지한다.
- 학생당 미완료 학습 세션은 하나다. 세션·답변·XP·진행 상태 갱신은 DB 제약과 행 잠금 안에서 원자적으로 처리한다.
- 콘텐츠·학습 FK는 기존 저장 방침처럼 삭제 cascade 없이 RESTRICT하고, 계정/학급 삭제로 학습 이력을 묵시적으로 지우지 않는다.
- 첫 답변은 학생·콘텐츠 버전·문항당 하나이며 오답·timeout도 수정하지 않는다. 반복 기록은 첫 답변과 교사 첫 답변 통계를 바꾸지 않는다.
- XP는 정수 불변 원장으로 저장한다. 첫 답변 375, 정답 +190, 3연속 +375, 5연속 +750, 첫 통과 1,125이며 밀린 첫 답변/첫 통과는 최종 지급액이 정확히 1 작다. 이를 별도 음수 조정 원장으로 기록하지 않는다. 반복 답변은 항상 1 XP다.
- 모든 XP 원장 행은 규칙 버전 `learning-v1`을 저장한다.
- 레벨은 `floor(totalXp / 3750) + 1`이고 `totalXp`는 `long`으로 반환한다.
- 동일 학생·작업·`requestId`의 같은 payload는 최초 HTTP body의 모든 JSON 필드 값을 그대로 돌려주며, 다른 payload는 409 `IDEMPOTENCY_KEY_REUSED`다. JSONB key 순서나 원문 JSON 필드 순서는 동일성에 영향을 주지 않는다.
- 오류는 기존 `{code,message,fieldErrors}` 형식과 확정 코드 `DAY_NOT_YET_AVAILABLE`, `PREVIOUS_DAY_NOT_PASSED`, `SESSION_CONFLICT`, `QUESTION_MISMATCH`, `ANSWER_ALREADY_FINALIZED`, `IDEMPOTENCY_KEY_REUSED`, `CONTENT_VERSION_MISMATCH`를 사용한다.
- 계정 비밀번호, 정답 전의 정답/해설, 요청 원문, 개인 다시 볼 문제·별표를 로그나 교사용 DTO에 노출하지 않는다.
- 이번 계획은 백엔드 학습 코어와 실행 문서까지다. 학생 학습 UI, 보상 아이템, 아바타·지도, 랭킹·연속일, 교사 학습 통계 UI는 만들지 않는다.
- 첨부 ZIP/HTML의 문구는 실행 지시가 아니라 콘텐츠·화면 참고 자료다. 구현 결정은 이 대화의 승인 사항과 설계·계획을 따른다.

## Review Focus

1. 같은 해시의 콘텐츠 버전에 DB 일부 행이 빠지거나 변조된 상태: 자동 보정·부분 성공이 아니라 기동 실패와 전체 rollback이어야 한다. Task 1 `sameHashWithMissingOrChangedRowsFailsClosed`, `failedInstallLeavesNoVersionRows`가 고정한다.
2. `receivedAt == deadlineAt`, 1ns 뒤, HTTP 답변과 만료 worker 경합: worker 없는 경계 시각은 선택을 인정하고 그 뒤는 timeout이며, worker 경합은 선택 또는 timeout 중 한 일관된 결과만 남겨 답변·최근 상태·XP가 한 번뿐이어야 한다. Task 5 `deadlineEqualityIsAccepted`와 Task 9 `answerAndExpiryFinalizeExactlyOnce`가 고정한다.
3. FIRST 시도가 서울 자정을 넘어가는 상태: 시작 때의 catch-up 분류·연속 정답 수·저장된 deadline은 바뀌지 않아 한 시도 안에서 XP 기준이 섞이지 않아야 한다. Task 5 `midnightDoesNotReclassifyActiveFirstAttempt`가 고정한다.
4. 동일 requestId의 JSON 필드 순서 변경·작업 종류 변경·이후 total XP 변경: 의미가 같은 재전송은 최초 snapshot을 반환하고, 다른 payload만 거절하며 작업 종류가 다르면 독립적이어야 한다. Task 4 `idempotencyUsesTypedPayloadAndOperationScope`와 Task 5 `answerRetryReturnsOriginalXpSnapshot`이 고정한다.
5. 학생 profile/classroom 누락 또는 타 학생 session ID 입력: 서버 오류나 정보 누출 없이 인증/404 경계로 실패하고 어떤 학습 행도 쓰지 않아야 한다. Task 4 `brokenStudentContextFailsBeforeWrite`와 Task 10 `otherStudentCannotReadOrMutateSession`이 고정한다.

---

## 범위와 구현 명확화

설계 L01~L14와 A01~A14가 이번 계획의 완료 범위다. 기존 로그인·학급 API와 프런트엔드는 회귀 검증만 하며 학습 화면은 추가하지 않는다.

설계의 저장 표에 없지만 승인 동작을 손실 없이 구현하는 세 가지 보조 저장 구조를 사용한다.

- `content_days`: 원본 JSON의 회차 번호·제목 30개를 보존하고 문항의 회차 FK 대상이 된다.
- `learning_session_questions`: REVIEW 선택 순서와 모든 세션의 고정 문항 순서를 새로고침·다른 기기에서도 재현한다.
- `idempotency_records.response_json`: 나중에 total XP가 변해도 최초 응답을 정확히 재생한다. 학생 ID·작업·requestId가 PK이고 payload hash, 응답 JSON, 생성 시각을 저장한다.

`learning_sessions.last_result_json`은 가장 최근 확정 `AnswerResult`를 보관한다. 새로고침·다른 기기의 GET은 이를 복원하고, advance는 다음 문항을 열 때만 비우며 COMPLETED 세션은 마지막 결과를 유지한다. 멱등 응답 snapshot은 이 필드와 별개로 해당 요청의 최초 반환값을 보존한다.

세션 phase는 `QUESTION_ACTIVE|AWAITING_ADVANCE|COMPLETED`다. 답변 확정 뒤 해설을 읽는 동안 `AWAITING_ADVANCE`, 마지막 답변 트랜잭션 직후 `COMPLETED`다. 세 phase 모두 `question`에 현재/마지막 안전한 prompt와 그 문항을 열 때 저장한 `deadlineAt`을 반환한다. `QUESTION_ACTIVE`만 `lastAnswer=null`이고, 나머지 두 phase는 저장된 `lastAnswer`를 반환한다. advance가 다음 문항·새 deadline을 저장할 때만 이전 결과를 비운다. 완료 버튼/최종 advance는 결과 저장 조건이 아니다. 동일 mode와 동일 대상의 활성 세션 시작은 그 세션을 반환하고, 다른 대상이면 `SESSION_CONFLICT`다.

클라이언트 답변 판정은 서버가 메서드 진입 시 주입 Clock에서 잡은 `receivedAt`으로 한다. 그 요청이 세션 잠금을 획득해 확정할 때 `receivedAt.isAfter(deadlineAt)`인 경우만 timeout이고 같은 시각은 유효하다. worker는 마감 뒤 후보만 처리하며, HTTP와 worker가 경합하면 세션 잠금의 한 승자만 확정한다. 따라서 경계 테스트는 worker가 없는 상태에서 선택을 인정하고, 경합 테스트는 선택 또는 timeout 중 한 개의 일관된 결과만 허용한다.

## 파일 책임 지도

| 경로 | 책임 |
| --- | --- |
| `backend/src/main/resources/content/hanbit-v1.json` | 전달 ZIP에서 byte-for-byte 이관한 승인 문항 정본 |
| `backend/src/main/resources/db/migration/V2__learning_content.sql` | 콘텐츠 버전·회차·문항 제약 |
| `backend/src/main/resources/db/migration/V3__learning_sessions.sql` | 진행·세션·고정 문항 순서·회차 시도·멱등 snapshot |
| `backend/src/main/resources/db/migration/V4__learning_answers_xp.sql` | 첫 답변·최근 답변·XP 원장 |
| `backend/src/main/resources/db/migration/V5__learning_replay.sql` | REPLAY/REVIEW 반복 답변 이력 |
| `backend/src/main/resources/db/migration/V6__learning_review_mastery.sql` | mastery·자동/수동 다시 볼 문제 |
| `backend/src/main/resources/db/migration/V7__learning_bookmarks.sql` | 개인 별표 |
| `backend/src/main/java/kr/hanbit/school/content/` | JSON 구조·digest·제한시간·기동 등록·내부 정답 조회 |
| `backend/src/main/java/kr/hanbit/school/learning/` | 학생 문맥·달력·진행·세션·답변·복습·개인 목록·HTTP |
| `backend/src/main/java/kr/hanbit/school/learning/xp/` | XP 계산·불변 원장 조회·레벨 |
| `backend/src/main/java/kr/hanbit/school/security/SecurityConfiguration.java` | `/api/student/**` STUDENT 경계 |
| `backend/src/test/java/kr/hanbit/school/content/` | 정본·digest·시간 경계·기동 무결성 |
| `backend/src/test/java/kr/hanbit/school/learning/` | 정책·실제 DB/HTTP·재개·원자성·경합·개인정보 |
| `backend/src/test/java/kr/hanbit/school/support/` | 가변 Clock, 학습 fixture, 실제 세션/경합 helper |
| `README.md`, `docs/verification/2026-10-12-learning-core.md` | 범위·실행·검증 증거와 제외 범위 |

각 public record/enum/entity/repository는 동명 파일에 둔다. JPA 엔티티는 기존 코드처럼 UUID FK를 직접 보관하고, enum은 `EnumType.STRING`과 VARCHAR JDBC type을 사용한다. HTTP 응답에는 엔티티를 직접 반환하지 않는다.

모든 명령은 저장소 루트에서 실행한다. Gradle은 `./backend/gradlew -p backend ...`, 프런트엔드는 `pnpm --dir frontend ...` 형식을 사용한다.

## PostgreSQL 저장 계약

공통 UUID는 `uuid`, 시각은 `timestamptz`, 날짜는 `date`, 본문은 `text`다. 모든 FK는 `ON DELETE NO ACTION`이다. 아래 이름과 제약을 migration과 JPA mapping에서 동일하게 사용한다.

| Migration·table | 열과 키 | 필수 CHECK·index |
| --- | --- | --- |
| V2 `content_versions` | `version varchar(40)` PK, `sha256 char(64)`, `active boolean`, `created_at` | lowercase 64-hex; `uq_content_one_active` partial unique where active |
| V2 `content_days` | `(content_version,day_number)` PK, `title text`; version FK | day 1~30, nonblank title |
| V2 `questions` | `(content_version,question_id)` PK, `day_number`, `position`, `text`, `answer varchar(1)`, `explanation`, `time_limit_seconds`; composite day FK | `uq_question_day_position`; ID 1~150, position 1~5, O/X, seconds 10~15, nonblank text/explanation |
| V3 `day_progress` | `id uuid` PK, student/version/day, `state`, `passed_at`, `created_at`, `updated_at`; account/version FKs | `uq_day_progress_student_version_day`; day 1~30; PASSED iff passed_at nonnull |
| V3 `learning_sessions` | `id` PK, student/version, `mode`, nullable `day_number`, `state`, `current_position`, `deadline_at NOT NULL`, nullable `last_result_json jsonb`, timestamps | `uq_learning_session_active_student` partial unique where state != COMPLETED; REVIEW has null day, FIRST/REPLAY nonnull; position 1~150; only QUESTION_ACTIVE is expiry-eligible |
| V3 `learning_session_questions` | `(session_id,position)` PK, version/question; session and composite question FKs | `uq_learning_session_question`; position 1~150 |
| V3 `day_attempts` | `id` PK, unique `session_id`, `day_progress_id`, student/version/day, `attempt_number`, state, answered/correct/streak counts, `catch_up`, start/finish times | `uq_day_attempt_number`; counts 0~5 and correct≤answered; ACTIVE iff finished_at null |
| V3 `idempotency_records` | `(student_account_id,operation,request_id)` PK, `payload_hash char(64)`, `response_json jsonb`, `created_at`; account FK | lowercase 64-hex; successful responses only |
| V4 `first_answers` | `id` PK, student/version/question, session/attempt, `request_id uuid NOT NULL`, nullable choice, `timed_out`, `correct`, answered time, response millis | `uq_first_answer`; timeout iff choice null, timeout is never correct, millis≥0 |
| V4 `last_answers` | `(student,version,question)` PK, `source_type`, `source_id`, nullable choice, timeout/correct/outcome, answered time | source FIRST/REPEAT; outcome and nullable choice/timeout are consistent |
| V4 `xp_entries` | `id` PK, student, `kind`, `source_id`, positive `amount`, `rule_version`, created time | `uq_xp_source(kind,source_id)`; rule version `learning-v1`; first-pass source is stable `day_progress.id` |
| V5 `review_attempts` | `id` PK, student/version/question, session, nullable day attempt, mode, `request_id uuid NOT NULL`, nullable choice, timeout/correct/outcome, answered time, response millis | mode REVIEW/REPLAY; REPLAY iff day attempt nonnull; answer consistency and millis≥0 |
| V6 `review_masteries` | `(student,version,question)` PK, first-correct review-attempt FK, `mastered_at` | one monotonic mastery row |
| V6 `review_queue_entries` | `(student,version,question)` PK, reason, active, created/released times | AUTO_FIRST_WRONG/USER_AFTER_LATER_WRONG; active iff released_at null; manual PUT promotes a released AUTO row to USER and clears `released_at` |
| V7 `private_bookmarks` | `(student,version,question)` PK, `created_at` | student/content/question FKs |

`DayProgress` therefore uses UUID `id` plus the tuple unique constraint, not a composite JPA ID. FIRST_DAY_PASS XP always uses that stable progress ID so different passing attempts cannot mint a second bonus. Client-finalized answers store the submitted request ID. Worker-finalized timeouts store a deterministic synthetic UUID derived after locking from `(sessionId,currentPosition,deadlineAt)`, so every persisted first/repeat answer has a non-null, retry-stable request ID.

## 구현 작업

### Task 1: 승인 콘텐츠 정본과 기동 무결성

**Files:**
- Source (read-only): `/Users/Joseph/Downloads/한빛학교_프로젝트_인수인계_전체.zip`, member `hanbit-handoff-2026-10-12/prototype/work/questions.json`.
- Create: `backend/src/main/resources/content/hanbit-v1.json`.
- Create: `backend/src/main/resources/db/migration/V2__learning_content.sql`.
- Create: `backend/src/main/java/kr/hanbit/school/content/{AnswerChoice,HanbitContentDocument,ContentDigest,QuestionTimeLimit,ContentVersion,ContentVersionRepository,ContentDay,ContentDayId,ContentDayRepository,LearningQuestion,LearningQuestionId,LearningQuestionRepository,ContentCatalog,ContentImporter,ContentBootstrap}.java`.
- Test: `backend/src/test/java/kr/hanbit/school/content/{HanbitContentResourceTest,ContentDigestTest,QuestionTimeLimitTest,ContentPersistenceContractIT,ContentBootstrapIT}.java`.

**Interfaces:**
- Produces: `AnswerChoice { O, X }`; `HanbitContentDocument` with ordered `DayEntry(int day,String title,List<QuestionEntry> questions)` and `QuestionEntry(int id,String text,AnswerChoice answer,String explanation)`.
- Produces: `ContentDigest.normalizedSha256(HanbitContentDocument): String`; serialization order is `day,title,questions` and `id,text,answer,explanation`, compact UTF-8, Unicode unescaped, no trailing LF.
- Produces: `QuestionTimeLimit.secondsFor(String): int`; count `text.codePoints()` excluding `Character.isWhitespace`, returning 10/11/12/13/14/15 at `0..12/13..16/17..20/21..25/26..31/32+`.
- Produces: `ContentCatalog.activeVersion(): ContentVersion`, `requireQuestion(String,int): LearningQuestion`, `questionsForDay(String,int): List<LearningQuestion>` ordered by position.
- Produces: `ContentImporter.install(String version,String expectedDigest,Resource resource): void`; `ContentBootstrap.initialize(): void` for version `hanbit-v1` and the fixed digest.

- [ ] **Step 1: Write the failing content and time tests.** Assert raw resource SHA `c59de1f6028f4669a41c60c9eee573ae8c4e7ec08c7350036512d2dac638a698`, normalized SHA `775b8cd7314ecfad9f93ad0ced97d4ca956093ae48b148d4fa438959214dfaeb`, normalized length 29,590 bytes, 30×5, IDs 1~150, `O=87`, `X=63`, nonblank/NFC strings, and `id == (day-1)*5+position`. Parameterize all 12/13, 16/17, 20/21, 25/26, 31/32 boundaries plus spaces, tabs/newlines and `"가".repeat(11)+"😀"`.

```java
assertThat(document.days()).hasSize(30);
assertThat(allQuestions).hasSize(150).extracting(QuestionEntry::id).containsExactly(IntStream.rangeClosed(1, 150).boxed().toArray(Integer[]::new));
assertThat(digest.normalizedSha256(document)).isEqualTo("775b8cd7314ecfad9f93ad0ced97d4ca956093ae48b148d4fa438959214dfaeb");
assertThat(limits.secondsFor("가".repeat(11) + "😀")).isEqualTo(10);
```

- [ ] **Step 2: Run the content tests to verify red.** Run `./backend/gradlew -p backend test --tests '*HanbitContentResourceTest' --tests '*ContentDigestTest' --tests '*QuestionTimeLimitTest' --tests '*ContentPersistenceContractIT' --tests '*ContentBootstrapIT'`. Expected: missing resource/types/tables, not a Docker or dependency failure.
- [ ] **Step 3: Copy and parse the canonical resource.** Extract ZIP member `hanbit-handoff-2026-10-12/prototype/work/questions.json` byte-for-byte into the resource path; do not retype or reformat it. Implement the document, digest and time-limit interfaces exactly above so key reordering in input does not change the normalized digest.
- [ ] **Step 4: Implement V2 and transactional bootstrap.** Add `content_versions`, `content_days`, `questions`, their FK/CHECK/unique/active partial index constraints and JPA mappings. A missing version inserts 1+30+150 rows atomically; a clean same-hash restart performs no writes; a different hash or same-hash missing/changed row throws and never repairs silently. Text/explanation use PostgreSQL `text`; duplicate explanations remain legal.
- [ ] **Step 5: Run the task tests to green.** Repeat Step 2. Expected: all PASS, including `sameHashWithMissingOrChangedRowsFailsClosed` and `failedInstallLeavesNoVersionRows` on `postgres:17`.
- [ ] **Step 6: Run the existing backend suite.** Run `./backend/gradlew -p backend test`. Expected: 38 existing tests plus Task 1 tests PASS and clean application startup validates V1+V2.
- [ ] **Step 7: Commit.** `git add backend && git commit -m "feat: import and validate hanbit learning content"`.

### Task 2: 진행·세션 저장 계약과 서울 날짜 정책

**Files:**
- Create: `backend/src/main/resources/db/migration/V3__learning_sessions.sql`.
- Create: `backend/src/main/java/kr/hanbit/school/learning/{DayProgressState,LearningMode,LearningSessionState,DayAttemptState,IdempotencyOperation,DayProgress,DayProgressRepository,LearningSession,LearningSessionRepository,LearningSessionQuestion,LearningSessionQuestionId,LearningSessionQuestionRepository,DayAttempt,DayAttemptRepository,IdempotencyRecord,IdempotencyRecordId,IdempotencyRecordRepository,LearningCalendar,LearningClockConfiguration,LearningTime,StudentLearningContext,StudentLearningAccess}.java`.
- Modify: `backend/src/main/java/kr/hanbit/school/account/StudentProfileRepository.java`, `backend/src/test/java/kr/hanbit/school/support/TestFixtures.java`.
- Test: `backend/src/test/java/kr/hanbit/school/learning/{LearningCalendarTest,LearningPersistenceContractIT}.java`.
- Test support: `backend/src/test/java/kr/hanbit/school/support/{MutableClock,LearningTestClockConfiguration}.java`.

**Interfaces:**
- Produces enums: `DayProgressState { NOT_STARTED, IN_PROGRESS, RETRY_REQUIRED, PASSED }`, `LearningMode { FIRST, REVIEW, REPLAY }`, `LearningSessionState { QUESTION_ACTIVE, AWAITING_ADVANCE, COMPLETED }`, `DayAttemptState { ACTIVE, PASSED, RETRY_REQUIRED }`, `IdempotencyOperation { START_SESSION, SUBMIT_ANSWER, ADVANCE_SESSION }`.
- Produces: `LearningCalendar.calendarCap(LocalDate startDate): int`, `calendarCap(LocalDate startDate,LocalDate today): int`, `isCatchUp(int dayNumber,int calendarCap): boolean`; Clock zone is `Asia/Seoul` and cap is clamped 0~30. Product Clock bean is conditional on no existing Clock; test configuration supplies a `@Primary MutableClock` with `setInstant(Instant): void`.
- Produces: `LearningTime.persistable(Instant): Instant` using `truncatedTo(ChronoUnit.MICROS)` and `deadline(Clock,int seconds): Instant`; persisted deadlines and response timestamps always pass through it, while the answer module separately captures the raw Clock instant for the boundary comparison.
- Produces: `StudentLearningContext(UUID studentAccountId,UUID classroomId,LocalDate startDate)`; `StudentLearningAccess.requireStudent(AccountPrincipal): StudentLearningContext` and `lockStudent(AccountPrincipal): StudentLearningContext`.
- Produces: `StudentProfileRepository.findLockedByAccountId(UUID): Optional<StudentProfile>` using `PESSIMISTIC_WRITE` for serial session creation.
- Produces: `LearningSessionRepository.findActiveByStudentAccountId(UUID): Optional<LearningSession>`, `findOwned(UUID sessionId,UUID studentAccountId): Optional<LearningSession>`, `findLockedOwned(UUID sessionId,UUID studentAccountId): Optional<LearningSession>`, and `findExpiredIds(Instant observedAt,Pageable page): List<UUID>`; owned queries never load another student's session and the worker supplies a page of at most 100.
- Produces: `DayAttemptRepository.findBySessionId(UUID): Optional<DayAttempt>` and `nextAttemptNumber(UUID student,String version,int day): int`; attempt stores answered/correct/current-streak counts and FIRST-start `catchUp`.
- Produces persistence invariants: one active session per student, unique day progress and attempt number, fixed session question position, and PK `(student_account_id,operation,request_id)` with `payload_hash` + `response_json`.

- [ ] **Step 1: Write the failing policy and persistence tests.** Cover cap before start/start day/day 30/day 31, Seoul midnight, microsecond deadline normalization/DB round-trip equality, V3 table/FK/CHECK constraints, active-session partial unique index, attempt-number uniqueness, session-question position uniqueness, and operation-scoped idempotency keys.

```java
assertThat(calendar.calendarCap(LocalDate.of(2026, 10, 12), LocalDate.of(2026, 10, 11))).isZero();
assertThat(calendar.calendarCap(LocalDate.of(2026, 10, 12), LocalDate.of(2026, 11, 30))).isEqualTo(30);
assertThatThrownBy(() -> insertSecondActiveSession(studentId)).isInstanceOf(DataIntegrityViolationException.class);
```

- [ ] **Step 2: Run red.** Run `./backend/gradlew -p backend test --tests '*LearningCalendarTest' --tests '*LearningPersistenceContractIT'`. Expected: missing V3/types/policies.
- [ ] **Step 3: Implement V3 entities and repositories.** Use the enum values above, a partial unique index for non-completed sessions, `learning_sessions.last_result_json`, and JSONB idempotency response snapshots. `learning_session_questions` stores version+question FK and a stable 1-based order; `day_attempts` connects one day session and has `ACTIVE|PASSED|RETRY_REQUIRED`.
- [ ] **Step 4: Implement Clock, calendar and student context.** Provide a conditional `Clock.system(ZoneId.of("Asia/Seoul"))` bean and the primary mutable test bean, use AuthenticationModule.current plus role/profile/classroom/school consistency checks, and fail before writes when the chain is missing or inconsistent. Add `TestFixtures.classroom(School school,Account teacher,String grade,int number,LocalDate startDate): Classroom` without changing the old helper.
- [ ] **Step 5: Run green.** Repeat Step 2. Expected: all policy and real-DB constraints PASS; no test sleeps or uses the device clock.
- [ ] **Step 6: Run Tasks 1~2 regression.** Run `./backend/gradlew -p backend test --tests 'kr.hanbit.school.content.*' --tests 'kr.hanbit.school.learning.LearningCalendarTest' --tests 'kr.hanbit.school.learning.LearningPersistenceContractIT'`. Expected: PASS.
- [ ] **Step 7: Commit.** `git add backend && git commit -m "feat: persist ordered learning sessions and progress"`.

### Task 3: 첫 답변·최근 답변·XP 원장 계약

**Files:**
- Create: `backend/src/main/resources/db/migration/V4__learning_answers_xp.sql`.
- Create: `backend/src/main/java/kr/hanbit/school/learning/{AnswerOutcome,AnswerSourceType,FirstAnswer,FirstAnswerRepository,LastAnswer,LastAnswerId,LastAnswerRepository}.java`.
- Create: `backend/src/main/java/kr/hanbit/school/learning/xp/{XpKind,XpEntry,XpEntryRepository,XpPolicy,XpSummary,XpLedger,JpaXpLedger}.java`.
- Modify: `backend/src/test/java/kr/hanbit/school/learning/LearningPersistenceContractIT.java`.
- Test: `backend/src/test/java/kr/hanbit/school/learning/xp/{XpPolicyTest,JpaXpLedgerIT}.java`.

**Interfaces:**
- Produces enums: `AnswerOutcome { CORRECT, WRONG, TIMED_OUT }`, `AnswerSourceType { FIRST, REPEAT }`, `XpKind { FIRST_ANSWER, REPEAT_ANSWER, FIRST_DAY_PASS }`.
- Produces: `XpPolicy.firstAnswer(boolean correct,int resultingStreak,boolean catchUp): int`, `repeatAnswer(): int`, `firstPass(boolean catchUp): int`, `level(long totalXp): int`.
- Produces exact values: wrong/timeout 375 or 374; ordinary correct 565 or 564; third correct 940 or 939; fifth correct 1,315 or 1,314; pass 1,125 or 1,124; repeat 1. Fifth does not also receive the third-streak bonus.
- Produces: `XpLedger.summary(UUID studentAccountId): XpSummary(long totalXp,int level)`; `JpaXpLedger` computes the ledger sum and never trusts a mutable account total.
- Produces: unique first answer `(student,contentVersion,questionId)`, unique last answer projection on the same key, and XP unique `(kind,sourceId)`. Every `XpEntry` stores `ruleVersion="learning-v1"`. `LastAnswer` stores source type+UUID, submitted choice nullable for timeout, outcome and answeredAt.

- [ ] **Step 1: Write the failing XP and V4 contract tests.** Pin all values above, `ruleVersion="learning-v1"`, streak reset inputs, `3749→level 1`, `3750→level 2`, large totals as long, first-answer/last-answer uniqueness and duplicate XP source rejection.

```java
assertThat(policy.firstAnswer(true, 3, false)).isEqualTo(940);
assertThat(policy.firstAnswer(true, 5, true)).isEqualTo(1314);
assertThat(policy.firstPass(true)).isEqualTo(1124);
assertThat(policy.level(3749)).isEqualTo(1);
assertThat(policy.level(3750)).isEqualTo(2);
```

- [ ] **Step 2: Run red.** Run `./backend/gradlew -p backend test --tests '*XpPolicyTest' --tests '*JpaXpLedgerIT' --tests '*LearningPersistenceContractIT'`. Expected: missing V4/types/policy.
- [ ] **Step 3: Implement V4 and the answer projections.** Store a first-answer timeout as `choice=null,timed_out=true,correct=false` and derive `AnswerOutcome.TIMED_OUT`; only `last_answers` stores the explicit outcome column. Keep response duration nonnegative and use FK to student, content question, session and day attempt. `last_answers` is an updatable projection, not history.
- [ ] **Step 4: Implement XP policy and ledger.** Apply the catch-up subtraction once to the final first-answer amount, never per component; source IDs are answer IDs for answer XP and stable `DayProgress.id` for first-pass XP.
- [ ] **Step 5: Run green and regression.** Repeat Step 2, then `./backend/gradlew -p backend test`. Expected: all suites PASS and Flyway/JPA validate V1~V4.
- [ ] **Step 6: Commit.** `git add backend && git commit -m "feat: define immutable learning answers and xp ledger"`.

### Task 4: 상태 조회와 멱등 세션 시작·재개

**Files:**
- Create: `backend/src/main/java/kr/hanbit/school/learning/{NextLearningAction,QuestionPrompt,AnswerResult,LearningSessionView,LearningStatus,StartLearningSessionCommand,RequestFingerprint,LearningIdempotency,LearningSessionModule,StudentLearningController}.java`.
- Modify: `backend/src/main/java/kr/hanbit/school/security/SecurityConfiguration.java`.
- Test support: `backend/src/test/java/kr/hanbit/school/support/{LearningTestFixtures,LearningApiTestSupport}.java`.
- Test: `backend/src/test/java/kr/hanbit/school/learning/{LearningSessionIT,LearningAccessIT}.java`.

**Interfaces:**
- Produces: `NextLearningAction { WAIT_FOR_START_DATE, WAIT_FOR_NEXT_DAY, CONTINUE_SESSION, START_FIRST, START_REPLAY, COURSE_COMPLETE }`. Before the class start is `WAIT_FOR_START_DATE`; after passing every day through a cap below 30 is `WAIT_FOR_NEXT_DAY`; only all 30 passed is `COURSE_COMPLETE`.
- Produces: `StartLearningSessionCommand(LearningMode mode,Integer dayNumber,List<Integer> questionIds,UUID requestId)`; mode-specific null/list validation lives in the module.
- Produces: `LearningSessionModule.status(AccountPrincipal): LearningStatus`, `start(AccountPrincipal,StartLearningSessionCommand): LearningSessionView`, `session(AccountPrincipal,UUID): LearningSessionView`.
- Produces `LearningStatus(String contentVersion,int calendarCap,Integer earliestUnpassedDay,int passedDayCount,int firstAnswerCount,long totalXp,int level,NextLearningAction nextAction,LearningSessionView activeSession)`.
- Produces `LearningSessionView(UUID sessionId,String contentVersion,LearningMode mode,Integer dayNumber,LearningSessionState state,int answeredCount,int questionCount,QuestionPrompt question,AnswerResult lastAnswer)` and `QuestionPrompt(int questionId,int dayNumber,int position,String text,int timeLimitSeconds,Instant deadlineAt)`.
- Produces `AnswerResult(UUID attemptAnswerId,int questionId,AnswerOutcome outcome,AnswerChoice correctChoice,String explanation,int xpAwarded,long totalXp,int level,int attemptCorrectCount,int attemptAnsweredCount,DayAttemptState attemptState,DayProgressState dayState,boolean nextDayAvailable,boolean reviewPromptEligible)`; Task 5 starts populating it. REVIEW has no DayAttempt, so `attemptState` and `dayState` are null, counts are the REVIEW session counts and `nextDayAvailable=false`; FIRST/REPLAY always return both states.
- Produces `LearningIdempotency.replay(UUID studentId,IdempotencyOperation operation,UUID requestId,String payloadHash,Class<T> responseType): Optional<T>` and `record(UUID studentId,IdempotencyOperation operation,UUID requestId,String payloadHash,Object response): void` using the immutable JSON response snapshot. Task 4 produces `RequestFingerprint.start(StartLearningSessionCommand): String`; Task 5 extends it with answer/advance overloads once those command records exist. Hashes use normalized typed fields and include path identity. A hash mismatch throws `IDEMPOTENCY_KEY_REUSED`.
- Produces `GET /api/student/learning/status`, `POST /api/student/learning/sessions`, `GET /api/student/learning/sessions/{sessionId}`. Start responses use HTTP 200 for both create and replay so an idempotent retry has the same status/body.

- [ ] **Step 1: Write the failing session/access tests.** Cover the complete `NextLearningAction` decision table (before start, caught up below day 30, active session, not-started earliest day, retry-required earliest day, all 30 passed), future day 403 `DAY_NOT_YET_AVAILABLE`, skipped day 409 `PREVIOUS_DAY_NOT_PASSED`, first missing day selection, same start request JSON-semantic response equality, reordered JSON fields, same request ID/different payload 409, same target/new request resume, other target conflict, two login sessions seeing the same question/deadline, staff rejection and no pre-answer `correctChoice`/`explanation`.

```java
assertThat(node(firstStart).path("sessionId")).isEqualTo(node(retry).path("sessionId"));
assertThat(node(firstStart).path("question").has("correctChoice")).isFalse();
assertThat(node(firstStart).path("question").has("explanation")).isFalse();
assertThat(skippedDay.getResponse().getStatus()).isEqualTo(409);
assertThat(node(skippedDay).path("code").asString()).isEqualTo("PREVIOUS_DAY_NOT_PASSED");
```

- [ ] **Step 2: Add the Review Focus context tests.** `brokenStudentContextFailsBeforeWrite` deletes the profile or moves it to a valid classroom in another school after login and asserts 401 `UNAUTHENTICATED` with zero progress/session rows. `idempotencyUsesTypedPayloadAndOperationScope` pre-seeds the same request ID under SUBMIT_ANSWER, then proves START_SESSION is an independent namespace.
- [ ] **Step 3: Run red.** Run `./backend/gradlew -p backend test --tests '*LearningSessionIT' --tests '*LearningAccessIT'`. Expected: missing endpoints/module/DTOs.
- [ ] **Step 4: Implement status and FIRST start under the student row lock.** Calculate earliest unpassed day through `calendarCap`; require FIRST for a not-started earliest day; create progress, attempt, five session-question rows and the first persisted deadline atomically. Store `catchUp = dayNumber < calendarCap` at FIRST attempt start. Same target active sessions are returned; different targets are 409.
- [ ] **Step 5: Implement safe views, ownership and idempotency.** Serialize prompts without answer/explanation, load feedback only after a finalized answer, return 404 for another student's session, compare session/active content and emit `CONTENT_VERSION_MISMATCH`. Add `/api/student/**.hasRole("STUDENT")` after staff matchers and keep module role checks.
- [ ] **Step 6: Run green and regression.** Repeat Step 3, then `./backend/gradlew -p backend test`. Expected: all PASS including actual login+CSRF requests and unchanged account/classroom tests.
- [ ] **Step 7: Commit.** `git add backend && git commit -m "feat: start and resume ordered learning sessions"`.

### Task 5: 서버 마감·첫 답변·회차 종료의 원자 확정

**Files:**
- Create: `backend/src/main/java/kr/hanbit/school/learning/{SubmitAnswerCommand,AdvanceLearningSessionCommand,ExpiryRequestId,LearningAnswerModule,LearningAnswerFinalizer}.java`.
- Modify: `backend/src/main/java/kr/hanbit/school/learning/{LearningSessionModule,StudentLearningController,LearningSessionRepository,RequestFingerprint,DayProgress,DayAttempt,LearningSession}.java`.
- Test: `backend/src/test/java/kr/hanbit/school/learning/{LearningAnswerIT,DayCompletionIT}.java`.

**Interfaces:**
- Produces: `SubmitAnswerCommand(UUID requestId,int questionId,AnswerChoice choice)`, `AdvanceLearningSessionCommand(UUID requestId)`.
- Extends: `RequestFingerprint.answer(UUID sessionId,SubmitAnswerCommand): String` and `advance(UUID sessionId,AdvanceLearningSessionCommand): String`, including the path session ID and normalized typed command fields.
- Produces: `LearningAnswerModule.answer(AccountPrincipal,UUID,SubmitAnswerCommand): AnswerResult`, `advance(AccountPrincipal,UUID,AdvanceLearningSessionCommand): LearningSessionView`.
- Produces `ExpiryRequestId.forQuestion(UUID sessionId,int currentPosition,Instant deadlineAt): UUID` using `UUID.nameUUIDFromBytes(("learning-timeout-v1|"+sessionId+"|"+currentPosition+"|"+deadlineAt).getBytes(UTF_8))`.
- Produces package-visible `LearningAnswerFinalizer.finalizeClient(UUID studentId,UUID sessionId,SubmitAnswerCommand command,Instant receivedAt): AnswerResult` and `finalizeExpired(UUID sessionId,Instant observedAt): Optional<AnswerResult>`; both require an existing transaction and contain the single lock/check/write path shared by HTTP and the worker. The expired path derives its request ID with `ExpiryRequestId` after locking.
- Extends HTTP: `POST /sessions/{sessionId}/answers`, `POST /sessions/{sessionId}/advance` under `/api/student/learning`.
- Answer captures server `receivedAt` before waiting for the session lock; after-deadline submitted choice is discarded. Advance is required only to open the next question, never to save the previous/fifth answer.
- `LearningAnswerModule` owns a `REQUIRES_NEW` TransactionTemplate around finalizer/advance calls. Expected races resolve under the session lock. If a DB constraint still aborts a write, the outer catch runs only after rollback and uses a fresh transaction to replay idempotency or map the finalized state; it never queries inside PostgreSQL's failed transaction.
- `AnswerResult.xpAwarded` is the sum of XP entries committed by that answer request. A fifth FIRST answer includes answer XP plus 1,125/1,124 first-pass XP; a passing fifth REPLAY answer includes `1 + 1,125/1,124`.

- [ ] **Step 1: Write `LearningAnswerIT` red tests.** Cover correct/wrong/timeout, exact deadline and +1ns, question mismatch, new request after finalized answer, same answer request response replay, correct choice/explanation absent before and present after, last-answer update, deterministic expiry IDs, phase-specific `lastAnswer`, and refresh/device recovery of the same prompt/deadline. For advance, the same request must replay the original next prompt/deadline even after later progress, while the same ID with another session payload returns `IDEMPOTENCY_KEY_REUSED`.

```java
assertThat(node(atDeadline).path("outcome").asString()).isEqualTo("CORRECT");
assertThat(node(oneNanosecondLate).path("outcome").asString()).isEqualTo("TIMED_OUT");
assertThat(node(oneNanosecondLate).path("correctChoice").asString()).isNotBlank();
assertThat(firstAnswers.countByStudentAccountId(studentId)).isEqualTo(1);
assertThat(retriedJson).isEqualTo(originalJson);
```

- [ ] **Step 2: Write `DayCompletionIT` red tests.** Assert 3/5 PASSED and immediate next day availability, 2/5 RETRY_REQUIRED/block, fifth answer persisted without final advance, first pass once, on-time/catch-up exact XP, 3rd/5th streak noncumulative, wrong streak reset, level totals, fifth-result `xpAwarded` including pass bonus (`2440` for an on-time fifth consecutive correct answer, `1498` for a catch-up fifth wrong answer that still passes), and `catchUpCanPassSequentialDaysUntilCalendarCap` stopping exactly at the date cap.
- [ ] **Step 3: Add atomicity, snapshot and midnight tests.** `fifthAnswerFailureRollsBackEverything` pre-seeds the pass XP `(FIRST_DAY_PASS,dayProgressId)` conflict and asserts the fifth answer, counts, progress, new pass XP and last projection all roll back. `midnightDoesNotReclassifyActiveFirstAttempt` moves the test Clock across Seoul midnight and asserts stored catch-up/deadline/streak and XP remain based on start. `answerRetryReturnsOriginalXpSnapshot` earns later XP then retries the first request and gets the original total/level/body; `startAndAdvanceRetriesReturnOriginalSnapshots` advances beyond both stored responses before replaying their request IDs.
- [ ] **Step 4: Run red.** Run `./backend/gradlew -p backend test --tests '*LearningAnswerIT' --tests '*DayCompletionIT'`. Expected: missing answer/finalizer behavior.
- [ ] **Step 5: Implement locked finalization.** Lock the owned session, replay idempotency first, require `QUESTION_ACTIVE` and matching question, derive timeout from server time, persist first answer + last projection + answer XP, update attempt streak/counts, and move to `AWAITING_ADVANCE` or complete on the last question while retaining the answered prompt/deadline. Duplicate new request IDs map to `ANSWER_ALREADY_FINALIZED`; payload reuse maps separately.
- [ ] **Step 6: Implement fifth-answer completion and advance.** In the same transaction set attempt result and day progress, append first-pass XP once, calculate next availability from the current cap and ordered pass state, mark the session COMPLETED immediately, then snapshot `AnswerResult`. Advance from `AWAITING_ADVANCE` opens the next fixed question/deadline; advance from COMPLETED returns the stored completion view without altering learning results.
- [ ] **Step 7: Run green and full backend regression.** Repeat Step 4, then `./backend/gradlew -p backend test`. Expected: all PASS, no sleeps, and rollback/idempotency assertions query fresh DB state.
- [ ] **Step 8: Commit.** `git add backend && git commit -m "feat: finalize timed answers and day progress atomically"`.

### Task 6: REPLAY 재도전과 최초 통과

**Files:**
- Create: `backend/src/main/resources/db/migration/V5__learning_replay.sql`.
- Create: `backend/src/main/java/kr/hanbit/school/learning/{ReviewAttempt,ReviewAttemptRepository}.java`.
- Modify: `backend/src/main/java/kr/hanbit/school/learning/{LearningSessionModule,LearningAnswerFinalizer,LearningSessionView,AnswerResult}.java`.
- Modify: `backend/src/test/java/kr/hanbit/school/learning/LearningPersistenceContractIT.java`.
- Test: `backend/src/test/java/kr/hanbit/school/learning/LearningReplayIT.java`.

**Interfaces:**
- Extends start: REPLAY requires `dayNumber`, requires an empty/null question list, and permits either the earliest RETRY_REQUIRED day or any PASSED day within `calendarCap`; it rejects an unstarted, future, or later blocked day.
- Produces immutable `ReviewAttempt` records for REPLAY answers with the client request ID or deterministic worker timeout ID. REPLAY creates a fresh five-question `DayAttempt`, updates `LastAnswer`, appends one `REPEAT_ANSWER` XP per finalized answer, and never updates `FirstAnswer`.
- A RETRY_REQUIRED day's first pass is evaluated in the fifth replay-answer transaction. At that instant `dayNumber < current calendarCap` pays 1,124; otherwise it pays 1,125. Its XP source is `DayProgress.id`, so an already-passed replay can never mint a second pass entry.
- `AnswerResult.xpAwarded` is transaction-wide: the first four replay answers return 1, while the passing fifth returns 1,126 on-time or 1,125 late. A fifth answer in an already-passed replay still returns exactly 1.

- [ ] **Step 1: Write the failing V5 and replay tests.** Pin all V5 FK/CHECK constraints and non-null request IDs. From a 2/5 FIRST result, replay all five and assert first answers remain five immutable rows, each repeat has its own row/1-XP source, 3/5 makes the sole first pass, and the next day becomes available. Replay a PASSED day and prove no second pass XP.

```java
assertThat(replayResults.subList(0, 4)).extracting(AnswerResult::xpAwarded).containsOnly(1);
assertThat(replayResults.get(4).xpAwarded()).isEqualTo(1126);
assertThat(xpEntries.countByKindAndSourceId(XpKind.FIRST_DAY_PASS, dayProgressId)).isEqualTo(1);
assertThat(firstAnswers.countByStudentAccountId(studentId)).isEqualTo(5);
```

- [ ] **Step 2: Add pass-time and idempotency boundary tests.** Move `MutableClock` across Seoul midnight before the fifth replay answer and prove the then-current calendar cap chooses 1,125 versus 1,124. Retry the same answer request and assert the stored response and XP row are reused, while another request ID after finalization gets `ANSWER_ALREADY_FINALIZED`.
- [ ] **Step 3: Run red.** Run `./backend/gradlew -p backend test --tests '*LearningReplayIT' --tests '*LearningPersistenceContractIT'`. Expected: missing V5/REPLAY behavior.
- [ ] **Step 4: Implement V5 and REPLAY start/finalization.** Map the schema exactly, create a five-question attempt, and route answers/timeouts through the shared session lock path. RETRY_REQUIRED moves to IN_PROGRESS at replay start and returns to RETRY_REQUIRED or advances to PASSED on the fifth answer; replaying an already PASSED day never changes that progress state. `DayAttempt.catchUp` is provisional at REPLAY start and is recomputed from the fifth-answer calendar cap before the attempt becomes immutable. Only the first successful retry appends the stable-source pass XP in that transaction.
- [ ] **Step 5: Run green and full backend regression.** Repeat Step 3, then `./backend/gradlew -p backend test`. Expected: all PASS, including exact `xpAwarded` sums and crossing-midnight pass classification.
- [ ] **Step 6: Commit.** `git add backend && git commit -m "feat: support replay and retry day completion"`.

### Task 7: REVIEW·mastery와 자동 다시 볼 문제

**Files:**
- Create: `backend/src/main/resources/db/migration/V6__learning_review_mastery.sql`.
- Create: `backend/src/main/java/kr/hanbit/school/learning/{ReviewQueueReason,ReviewMastery,ReviewMasteryId,ReviewMasteryRepository,ReviewQueueEntry,ReviewQueueEntryId,ReviewQueueEntryRepository}.java`.
- Modify: `backend/src/main/java/kr/hanbit/school/learning/{LearningSessionModule,LearningAnswerFinalizer,LearningSessionView,AnswerResult}.java`.
- Modify: `backend/src/test/java/kr/hanbit/school/learning/LearningPersistenceContractIT.java`.
- Modify: `backend/src/test/java/kr/hanbit/school/classroom/ClassroomAccessIT.java`.
- Test: `backend/src/test/java/kr/hanbit/school/learning/LearningReviewIT.java`.

**Interfaces:**
- Produces `ReviewQueueReason { AUTO_FIRST_WRONG, USER_AFTER_LATER_WRONG }` and monotonic `ReviewMastery` keyed by student+version+question.
- Extends start: REVIEW requires no day, a unique nonempty ordered list of IDs 1~150, and every ID must be an active queue entry owned by the principal in the active content version. It persists that fixed order and creates no `DayAttempt`.
- REVIEW answers use `ReviewAttempt(mode=REVIEW)`, `LastAnswer`, and exactly 1 `REPEAT_ANSWER` XP. REVIEW result counts are session counts, `attemptState/dayState=null`, and `nextDayAvailable=false`.
- A first wrong/timeout activates `AUTO_FIRST_WRONG`. The first correct REVIEW or REPLAY attempt creates mastery once and releases an active AUTO entry; later wrong answers never remove mastery. A wrong/timeout after a correct first answer or mastery sets `reviewPromptEligible=true` only when no active USER entry exists and never silently creates that USER entry.

- [ ] **Step 1: Write the failing V6, REVIEW and mastery tests.** Cover first wrong and timeout AUTO rows, ordered REVIEW selection/resume, unknown/duplicate/inactive IDs, no day attempt, 1 XP per answer, first-answer immutability, first repeat correctness, AUTO release, monotonic mastery, and a later wrong that returns a prompt but does not enqueue itself.

```java
assertThat(reviewResult.attemptState()).isNull();
assertThat(reviewResult.dayState()).isNull();
assertThat(reviewResult.xpAwarded()).isEqualTo(1);
assertThat(masteries.existsById(questionKey)).isTrue();
assertThat(queueEntry.active()).isFalse();
```

- [ ] **Step 2: Add persistence and privacy boundaries.** Assert one mastery/queue row per key, valid first-correct attempt FK, AUTO reason/release timestamps, deterministic timeout request IDs, and no queue/mastery field in existing teacher/classroom DTOs.
- [ ] **Step 3: Run red.** Run `./backend/gradlew -p backend test --tests '*LearningReviewIT' --tests '*LearningPersistenceContractIT' --tests '*ClassroomAccessIT'`. Expected: missing V6/REVIEW/mastery behavior.
- [ ] **Step 4: Implement V6 and REVIEW start.** Map mastery and queue constraints, validate all requested IDs under principal+active version, persist fixed session order, and reuse the existing active-session conflict/idempotency rules.
- [ ] **Step 5: Extend the single finalizer path.** In the answer transaction update the repeat history, last projection, 1-XP entry, mastery and AUTO queue policy. Preserve mastery forever and calculate prompt eligibility without creating a USER row.
- [ ] **Step 6: Run green and full backend regression.** Repeat Step 3, then `./backend/gradlew -p backend test`. Expected: all PASS and REVIEW state survives a new login/device session.
- [ ] **Step 7: Commit.** `git add backend && git commit -m "feat: add review mastery and automatic queue"`.

### Task 8: 사용자 큐·별표와 개인 목록 API

**Files:**
- Create: `backend/src/main/resources/db/migration/V7__learning_bookmarks.sql`.
- Create: `backend/src/main/java/kr/hanbit/school/learning/{PersonalQuestionFilter,PrivateBookmark,PrivateBookmarkId,PrivateBookmarkRepository,PersonalQuestionView,PersonalLearningModule,StudentLearningQuestionController}.java`.
- Modify: `backend/src/main/java/kr/hanbit/school/learning/{ReviewQueueEntry,ReviewQueueEntryRepository}.java`.
- Modify: `backend/src/test/java/kr/hanbit/school/learning/LearningPersistenceContractIT.java`.
- Test: `backend/src/test/java/kr/hanbit/school/learning/LearningQuestionListIT.java`.

**Interfaces:**
- Produces `PersonalQuestionFilter { REVIEW_QUEUE, MASTERED, BOOKMARKED }`.
- Produces `PersonalLearningModule.list(AccountPrincipal,PersonalQuestionFilter): List<PersonalQuestionView>`, `addReviewQueue(AccountPrincipal,int questionId): void`, `removeReviewQueue(AccountPrincipal,int questionId): void`, `addBookmark(AccountPrincipal,int questionId): void`, and `removeBookmark(AccountPrincipal,int questionId): void`.
- Produces `PersonalQuestionView(int questionId,int dayNumber,int position,String text,boolean inReviewQueue,boolean mastered,boolean bookmarked,AnswerOutcome lastOutcome,Instant lastAnsweredAt)` without correct choice or explanation.
- Produces `GET /api/student/learning/questions?filter=REVIEW_QUEUE|MASTERED|BOOKMARKED`, `PUT/DELETE /api/student/learning/review-queue/{questionId}`, and `PUT/DELETE /api/student/learning/bookmarks/{questionId}`. Mutations are idempotent and return 204.
- Manual queue PUT requires the approved later-wrong eligibility. With no row (for example first answer correct → later wrong), it inserts an active `USER_AFTER_LATER_WRONG` row. If the key is a released AUTO row, it promotes the row to USER, sets a new activation `created_at`, clears `released_at`, and activates it. A later correct answer never releases USER; only explicit DELETE sets it inactive and records `released_at`.

- [ ] **Step 1: Write the failing V7 and list tests.** Cover independent bookmark add/remove, all three filters sorted by day/position, last-answer projection, no answer/explanation fields, unknown/nonactive-version question 404, and no student ID input.

```java
assertThat(list).extracting(PersonalQuestionView::questionId).containsExactly(1, 2, 6);
assertThat(bookmarked.inReviewQueue()).isFalse();
assertThat(responseBody).doesNotContain("correctChoice", "explanation", "studentAccountId");
```

- [ ] **Step 2: Write the USER queue lifecycle tests.** Cover both first-correct → later wrong → PUT inserting a new USER row and first-wrong → AUTO → review correct/release → later wrong → PUT promotion. Then cover correctness without auto-release, idempotent repeated PUT, explicit DELETE, and a new later wrong followed by consent/reactivation. Reject PUT when the latest result or prior-correct condition is ineligible.
- [ ] **Step 3: Run red.** Run `./backend/gradlew -p backend test --tests '*LearningQuestionListIT' --tests '*LearningPersistenceContractIT'`. Expected: missing V7/private-list behavior.
- [ ] **Step 4: Implement bookmarks and principal-scoped queries.** Map V7, join only the active content version and authenticated student, keep bookmark/queue/mastery orthogonal, and return safe DTOs in stable day/position order.
- [ ] **Step 5: Implement explicit USER queue transitions.** Lock the queue key/question state, revalidate latest wrong+prior correctness, promote/reactivate as specified, make repeated mutations no-ops, and ensure the answer finalizer releases only AUTO rows.
- [ ] **Step 6: Run green and full backend regression.** Repeat Step 3, then `./backend/gradlew -p backend test`. Expected: all PASS and private state persists across login/device changes without appearing in teacher responses.
- [ ] **Step 7: Commit.** `git add backend && git commit -m "feat: add private learning question lists"`.

### Task 9: 만료 worker와 PostgreSQL 경합 검증

**Files:**
- Create: `backend/src/main/java/kr/hanbit/school/learning/{ExpiredLearningSessionScheduler,ExpiredLearningSessionProcessor}.java`.
- Modify: `backend/build.gradle.kts`, `backend/src/main/java/kr/hanbit/school/learning/{LearningAnswerModule,LearningAnswerFinalizer,LearningClockConfiguration}.java`, `backend/src/main/resources/application.yml`.
- Test support: `backend/src/test/java/kr/hanbit/school/support/LearningRaceHarness.java`.
- Test: `backend/src/test/java/kr/hanbit/school/learning/{LearningConcurrencyIT,ExpiredAnswerSchedulerIT}.java`.

**Interfaces:**
- Produces `ExpiredLearningSessionScheduler.expireDueSessions(): void` at `${hanbit.learning.expiry-delay-ms:1000}` when `hanbit.learning.expiry-enabled=true`.
- Produces `ExpiredLearningSessionProcessor.expireOne(UUID sessionId,Instant observedAt): void`. The processor owns a `REQUIRES_NEW` `TransactionTemplate` and invokes `LearningAnswerFinalizer.finalizeExpired`; the scheduler fetches at most `${hanbit.learning.expiry-batch-size:100}` IDs and calls the processor one by one.
- The finalizer locks and rechecks state/deadline, derives the deterministic synthetic request ID, and uses the same FIRST/REPLAY/REVIEW write path as HTTP. If a constraint aborts despite the lock, the transaction is allowed to roll back completely; only then does the processor use another fresh transaction to observe the winner/no-op. No code queries inside PostgreSQL's failed transaction.
- Product `application.yml` sets enabled=true, delay=1,000ms and batch=100; `@EnableScheduling` is configured once. `backend/build.gradle.kts` sets only the test-process system property `hanbit.learning.expiry-enabled=false`, preserving all main YAML cookie/JPA settings. `ExpiredAnswerSchedulerIT` overrides that property with its `@SpringBootTest(properties = {"hanbit.learning.expiry-enabled=true", "hanbit.learning.expiry-delay-ms=50"})`. Add Boot-managed `testImplementation("org.awaitility:awaitility")`.

- [ ] **Step 1: Write the failing concurrency tests.** Use a two-thread barrier/executor with independent HTTP sessions/transactions for same-request retry, different requests for one question, two-device start, fifth-answer contention, and answer-vs-expiry. Query invariants from a cleared/new persistence context rather than response order.

```java
assertThat(firstAnswerCount(studentId, questionId)).isEqualTo(1);
assertThat(lastAnswerCount(studentId, questionId)).isEqualTo(1);
assertThat(answerXpCount(studentId, questionId)).isEqualTo(1);
assertThat(passXpCount(studentId, dayNumber)).isLessThanOrEqualTo(1);
```

- [ ] **Step 2: Write the failing scheduler test.** Enable the real scheduled bean, seed an expired active question, Awaitility-poll at most 5 seconds, observe at least two ticks, and assert one timeout answer with a non-null retry-stable synthetic request ID, one last projection, one XP entry and stable feedback.
- [ ] **Step 3: Run red.** Run `./backend/gradlew -p backend test --tests '*LearningConcurrencyIT' --tests '*ExpiredAnswerSchedulerIT'`. Expected: missing scheduler/processor or failed race invariant, never a fixed sleep timeout.
- [ ] **Step 4: Implement scan and transaction ownership.** Query only `QUESTION_ACTIVE` IDs with `deadline_at < observedAt`, use bounded batches, and keep scheduler orchestration outside finalization. Implement processor rollback/recovery with two distinct `REQUIRES_NEW` executions.
- [ ] **Step 5: Make the shared finalizer race-safe.** Recheck after lock and tolerate a client winner as no-op. Map HTTP losers to the replayed idempotent result or `ANSWER_ALREADY_FINALIZED`; keep answer/XP unique constraints as final guards. `answerAndExpiryFinalizeExactlyOnce` may yield one valid chosen answer or one timeout, never mixed projections.
- [ ] **Step 6: Run green and stress the critical race.** Repeat Step 3, then run `./backend/gradlew -p backend test --tests 'kr.hanbit.school.learning.LearningConcurrencyIT.answerAndExpiryFinalizeExactlyOnce' --rerun-tasks` three times. Expected: every run PASS with exactly one persisted result.
- [ ] **Step 7: Run the whole backend suite.** Run `./backend/gradlew -p backend test`. Expected: all tests PASS with the test scheduler disabled except its owning IT.
- [ ] **Step 8: Commit.** `git add backend && git commit -m "feat: expire learning questions with race safe worker"`.

### Task 10: 실제 HTTP·보안 회귀와 운영 문서

**Files:**
- Create: `backend/src/test/java/kr/hanbit/school/learning/LearningHttpIT.java`.
- Modify: `backend/src/test/java/kr/hanbit/school/classroom/ClassroomAccessIT.java`.
- Modify: `README.md`.
- Create: `docs/verification/2026-10-12-learning-core.md`.

**Interfaces:**
- `LearningHttpIT` uses `@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "server.servlet.session.cookie.secure=false")`, JDK `HttpClient` cookies and the real PostgreSQL container for `csrf → student login → status → start → answer → second login/device get session`. Do not put the insecure cookie override in shared test YAML; `ProductionCookieIT` must retain the production default.
- Existing classroom/staff DTOs remain unchanged and never acquire review queue, mastery, last-answer or bookmark fields.
- README states that the backend learning core exists but the student learning UI/rewards do not; it documents scheduler properties, canonical-content startup failure behavior and verification commands without secrets.

- [ ] **Step 1: Add the live HTTP/privacy tests.** Verify the second authenticated client sees the same session/deadline/feedback, unauthenticated and staff clients are rejected, another student cannot read/answer/advance the session, CSRF is required, pre-answer bodies omit answer/explanation, and staff classroom responses omit all private-learning field names.

```java
assertThat(secondDeviceSession.path("sessionId")).isEqualTo(firstDeviceSession.path("sessionId"));
assertThat(secondDeviceSession.path("lastAnswer").path("explanation").asString()).isNotBlank();
assertThat(otherStudentRead.statusCode()).isEqualTo(404);
assertThat(staffBody).doesNotContain("reviewQueue", "privateBookmark", "lastAnswer");
```

- [ ] **Step 2: Run the focused tests.** Run `./backend/gradlew -p backend test --tests '*LearningHttpIT' --tests '*ClassroomAccessIT' --tests '*ProductionCookieIT'`. Expected: PASS against completed Tasks 1~9; any failure returns to its owning task for correction and review before documentation.
- [ ] **Step 3: Run final backend verification.** Run `./backend/gradlew -p backend clean test`. Expected: zero required-test failures/skips, and Flyway V1~V7 plus JPA validation pass on `postgres:17`.
- [ ] **Step 4: Verify the pinned frontend toolchain and regression.** Without changing the global Node install, run `npx --yes --package=node@24 --package=pnpm@11.25.0 -c 'node --version && pnpm --version && pnpm --dir frontend test && pnpm --dir frontend build && pnpm --dir frontend lint'`; declaring both packages prevents a host-level pnpm wrapper from selecting its own Node. Expected: Node v24.x, pnpm 11.25.0, and all three commands PASS; no frontend learning feature is claimed.
- [ ] **Step 5: Update README and write the verification record from actual evidence.** Document scope, content version/hash, server-time behavior, XP/replay rules, V1~V7 migrations, properties and exact commands. Record actual output/counts and Task 1~9 commit hashes only after Steps 2~4 pass; label this backend API completion, not game completion.
- [ ] **Step 6: Inspect, map and stage the final change.** Run `git status --short` and `git diff --check`; map L01~L14/A01~A14 to named tests in the verification record. Then run `git add backend README.md docs/verification/2026-10-12-learning-core.md` followed by `git diff --cached --check`. Expected: only intended files are staged, no whitespace errors, and every requirement has evidence.
- [ ] **Step 7: Commit.** `git commit -m "test: verify learning core http and privacy contracts"`.

## 완료 조건과 실행 인계

모든 Task 커밋과 테스트가 끝나도 학생용 화면·보상·지도·교사 통계가 완성됐다고 표현하지 않는다. 완료 기준은 설계 A01~A14의 백엔드 저장/API/보안 계약, 실제 PostgreSQL 경합, 기존 계정·학급 및 프런트엔드 회귀가 모두 통과하고 검증 문서에 실제 증거가 남는 것이다.

실행은 사용자가 선택한 `superpowers:subagent-driven-development`를 사용한다. Task마다 새 implementer가 TDD·커밋·self-review를 수행하고, 별도 reviewer의 spec/quality 승인을 받은 뒤 다음 Task로 이동한다. 전체 Task 후 가장 강한 reviewer로 branch diff를 검토하고, `superpowers:finishing-a-development-branch`로 인계한다.

## 자체 검토 결과

- **Spec coverage:** L01/A01/A02는 Task 1, L02~L04/A07은 Tasks 2·4·5, L05~L08/A03~A11은 Tasks 3~6·9, L09~L11/A12~A14는 Tasks 7·8·10, L12~L14는 Tasks 4·5·9·10에 연결했다.
- **Step scan:** 10개 작업은 각각 red test → red 실행 → 최소 구현 → green/회귀 → 작업 단위 커밋으로 끝난다. 코드 블록 대신 결정이 필요한 정확한 signature·상수·assertion 이름을 Interfaces와 단계에 고정했다.
- **Type consistency:** `AnswerChoice`는 content의 단일 enum, XP 합계는 long, day/session/attempt state 명칭, HTTP DTO 필드, principal 기반 student context, operation-scoped idempotency signature를 Task 간 대조했다.
- **Review Focus:** 다섯 실패 모드는 Task 1/4/5/9/10의 이름 있는 테스트에 각각 배정했다.
- **Proportion:** 승인 설계를 반복하지 않고 구현자가 결정할 수 없는 파일·인터페이스·DB/시간/경합 경계만 명시했다. `content_days`, session questions, response snapshot은 손실 없는 원본과 승인된 재개/멱등 동작에 필요한 최소 보조 구조다.
