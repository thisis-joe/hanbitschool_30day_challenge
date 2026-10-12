package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import kr.hanbit.school.account.AuthenticationModule;
import kr.hanbit.school.shared.web.ApiException;
import kr.hanbit.school.support.LearningApiTestSupport;
import kr.hanbit.school.support.LearningTestClockConfiguration;
import kr.hanbit.school.support.PostgresTestConfiguration;
import kr.hanbit.school.support.SessionTestClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({
  PostgresTestConfiguration.class,
  LearningTestClockConfiguration.class,
  SessionTestClient.class
})
class LearningSessionIT extends LearningApiTestSupport {
  @Autowired LearningSessionModule module;
  @Autowired LearningSessionRepository sessions;
  @Autowired LearningSessionQuestionRepository sessionQuestions;
  @Autowired DayProgressRepository progress;
  @Autowired DayAttemptRepository attempts;
  @Autowired IdempotencyRecordRepository idempotency;

  @Test
  void statusUsesTheCompleteOrderedLearningDecisionTable() throws Exception {
    var beforeStart = learning.student(LocalDate.of(2026, 10, 13));
    assertStatus(beforeStart, 0, null, 0, "WAIT_FOR_START_DATE");

    var caughtUp = learning.student(LocalDate.of(2026, 10, 8));
    learning.passedThrough(caughtUp, 5);
    assertStatus(caughtUp, 5, null, 5, "WAIT_FOR_NEXT_DAY");

    var active = learning.student(LocalDate.of(2026, 10, 12));
    var activeLogin = client.loginStudent(active);
    var activeStart = send("/api/student/learning/sessions", activeLogin, startBody(1, UUID.randomUUID()));
    assertThat(activeStart.getResponse().getStatus()).isEqualTo(200);
    var activeStatus = status(activeLogin);
    assertThat(node(activeStatus).path("nextAction").asString()).isEqualTo("CONTINUE_SESSION");
    assertThat(node(activeStatus).path("activeSession").path("sessionId"))
        .isEqualTo(node(activeStart).path("sessionId"));

    var first = learning.student(LocalDate.of(2026, 10, 10));
    learning.progress(first, 1, DayProgressState.PASSED);
    assertStatus(first, 3, 2, 1, "START_FIRST");

    var retry = learning.student(LocalDate.of(2026, 10, 10));
    learning.progress(retry, 1, DayProgressState.RETRY_REQUIRED);
    assertStatus(retry, 3, 1, 0, "START_REPLAY");

    var complete = learning.student(LocalDate.of(2026, 9, 13));
    learning.passedThrough(complete, 30);
    assertStatus(complete, 30, null, 30, "COURSE_COMPLETE");

    var dayTwentyNine = learning.student(LocalDate.of(2026, 9, 14));
    learning.passedThrough(dayTwentyNine, 29);
    assertStatus(dayTwentyNine, 29, null, 29, "WAIT_FOR_NEXT_DAY");

    var lastDayMissing = learning.student(LocalDate.of(2026, 8, 1));
    learning.passedThrough(lastDayMissing, 29);
    assertStatus(lastDayMissing, 30, 30, 29, "START_FIRST");

    var sparse = learning.student(LocalDate.of(2026, 10, 10));
    learning.progress(sparse, 1, DayProgressState.PASSED);
    learning.progress(sparse, 3, DayProgressState.PASSED);
    assertStatus(sparse, 3, 2, 2, "START_FIRST");

    var lastDayRetry = learning.student(LocalDate.of(2026, 8, 1));
    learning.passedThrough(lastDayRetry, 29);
    learning.progress(lastDayRetry, 30, DayProgressState.RETRY_REQUIRED);
    assertStatus(lastDayRetry, 30, 30, 29, "START_REPLAY");
  }

  @Test
  void startsTheEarliestMissingFirstDayAtomicallyWithASafePrompt() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 10));
    learning.progress(student, 1, DayProgressState.PASSED);
    var login = client.loginStudent(student);

    var response =
        send("/api/student/learning/sessions", login, startBody(2, UUID.randomUUID()));

    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    var body = node(response);
    assertThat(body.path("contentVersion").asString()).isEqualTo("hanbit-v1");
    assertThat(body.path("mode").asString()).isEqualTo("FIRST");
    assertThat(body.path("dayNumber").asInt()).isEqualTo(2);
    assertThat(body.path("state").asString()).isEqualTo("QUESTION_ACTIVE");
    assertThat(body.path("answeredCount").asInt()).isZero();
    assertThat(body.path("questionCount").asInt()).isEqualTo(5);
    assertThat(body.path("question").path("questionId").asInt()).isEqualTo(6);
    assertThat(body.path("question").path("position").asInt()).isEqualTo(1);
    assertThat(body.path("question").path("deadlineAt").asString())
        .isEqualTo("2026-10-12T00:00:12.123456Z");
    assertThat(body.path("question").has("correctChoice")).isFalse();
    assertThat(body.path("question").has("explanation")).isFalse();
    assertThat(body.path("lastAnswer").isNull()).isTrue();

    var sessionId = UUID.fromString(body.path("sessionId").asString());
    assertThat(sessionQuestions.findByIdSessionIdOrderByIdPositionAsc(sessionId)).hasSize(5);
    assertThat(progress.findByStudentAccountIdAndVersionAndDay(student.getId(), "hanbit-v1", 2))
        .get()
        .extracting(DayProgress::getState)
        .isEqualTo(DayProgressState.IN_PROGRESS);
    assertThat(attempts.findBySessionId(sessionId))
        .get()
        .satisfies(
            attempt -> {
              assertThat(attempt.getAttemptNumber()).isEqualTo(1);
              assertThat(attempt.getState()).isEqualTo(DayAttemptState.ACTIVE);
              assertThat(attempt.isCatchUp()).isTrue();
            });
  }

  @Test
  void startsTodaysFirstDayAsAnOnTimeAttempt() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));

    var response =
        send(
            "/api/student/learning/sessions",
            client.loginStudent(student),
            startBody(1, UUID.randomUUID()));

    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    var sessionId = UUID.fromString(node(response).path("sessionId").asString());
    assertThat(attempts.findBySessionId(sessionId))
        .get()
        .extracting(DayAttempt::isCatchUp)
        .isEqualTo(false);
  }

  @Test
  void startsAnExplicitNotStartedProgressRowWithoutReplacingItsIdentity() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var progressId = learning.progress(student, 1, DayProgressState.NOT_STARTED);
    var login = client.loginStudent(student);
    assertThat(node(status(login)).path("nextAction").asString()).isEqualTo("START_FIRST");
    assertThat(learning.count("learning_sessions", student)).isZero();
    assertThat(learning.count("day_attempts", student)).isZero();
    clock.setInstant(java.time.Instant.parse("2026-10-12T00:00:05.987654321Z"));

    var started = send("/api/student/learning/sessions", login, startBody(1, UUID.randomUUID()));

    assertThat(started.getResponse().getStatus()).isEqualTo(200);
    var sessionId = UUID.fromString(node(started).path("sessionId").asString());
    assertThat(progress.findById(progressId)).get().satisfies(row -> {
      assertThat(row.getState()).isEqualTo(DayProgressState.IN_PROGRESS);
      assertThat(row.getPassedAt()).isNull();
      assertThat(row.getCreatedAt())
          .isEqualTo(java.time.Instant.parse("2026-10-12T00:00:00.123456Z"));
      assertThat(row.getUpdatedAt())
          .isEqualTo(java.time.Instant.parse("2026-10-12T00:00:05.987654Z"));
    });
    assertThat(attempts.findBySessionId(sessionId)).get()
        .satisfies(attempt -> {
          assertThat(attempt.getDayProgressId()).isEqualTo(progressId);
          assertThat(attempt.getAttemptNumber()).isEqualTo(1);
          assertThat(attempt.getVersion()).isEqualTo("hanbit-v1");
          assertThat(attempt.isCatchUp()).isFalse();
        });
    assertThat(learning.count("day_progress", student)).isEqualTo(1);
    assertThat(learning.count("learning_sessions", student)).isEqualTo(1);
  }

  @Test
  void rejectsEveryInvalidFirstCommandShapeWithValidationErrors() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var principal = AuthenticationModule.principal(student);
    assertThatThrownBy(() -> module.start(principal, null))
        .isInstanceOfSatisfying(
            ApiException.class,
            error -> {
              assertThat(error.status()).isEqualTo(400);
              assertThat(error.code()).isEqualTo("VALIDATION_ERROR");
              assertThat(error.error().fieldErrors()).containsKey("request");
            });

    var login = client.loginStudent(student);
    var requestId = UUID.randomUUID();
    var cases =
        java.util.List.of(
            new InvalidFirst(
                "{\"mode\":\"FIRST\",\"dayNumber\":1,\"questionIds\":[]}", "requestId"),
            new InvalidFirst(
                "{\"mode\":\"REVIEW\",\"dayNumber\":1,\"questionIds\":[],\"requestId\":\""
                    + requestId
                    + "\"}",
                "mode"),
            new InvalidFirst(
                "{\"mode\":\"FIRST\",\"questionIds\":[],\"requestId\":\""
                    + UUID.randomUUID()
                    + "\"}",
                "dayNumber"),
            new InvalidFirst(
                "{\"mode\":\"FIRST\",\"dayNumber\":0,\"questionIds\":[],\"requestId\":\""
                    + UUID.randomUUID()
                    + "\"}",
                "dayNumber"),
            new InvalidFirst(
                "{\"mode\":\"FIRST\",\"dayNumber\":31,\"questionIds\":[],\"requestId\":\""
                    + UUID.randomUUID()
                    + "\"}",
                "dayNumber"),
            new InvalidFirst(
                "{\"mode\":\"FIRST\",\"dayNumber\":1,\"questionIds\":[1],\"requestId\":\""
                    + UUID.randomUUID()
                    + "\"}",
                "questionIds"));
    for (var invalid : cases) {
      var response = startRaw(login, invalid.body());
      assertThat(response.getResponse().getStatus()).as(invalid.field()).isEqualTo(400);
      assertThat(node(response).path("code").asString())
          .as(invalid.field())
          .isEqualTo("VALIDATION_ERROR");
      assertThat(node(response).path("fieldErrors").has(invalid.field()))
          .as(invalid.field())
          .isTrue();
    }
    assertThat(learning.count("day_progress", student)).isZero();
    assertThat(learning.count("learning_sessions", student)).isZero();
  }

  @Test
  void rejectsFutureAndSkippedFirstDaysWithStableErrors() throws Exception {
    var futureStudent = learning.student(LocalDate.of(2026, 10, 12));
    var future =
        send(
            "/api/student/learning/sessions",
            client.loginStudent(futureStudent),
            startBody(2, UUID.randomUUID()));
    assertThat(future.getResponse().getStatus()).isEqualTo(403);
    assertThat(node(future).path("code").asString()).isEqualTo("DAY_NOT_YET_AVAILABLE");

    var skippedStudent = learning.student(LocalDate.of(2026, 10, 10));
    var skipped =
        send(
            "/api/student/learning/sessions",
            client.loginStudent(skippedStudent),
            startBody(2, UUID.randomUUID()));
    assertThat(skipped.getResponse().getStatus()).isEqualTo(409);
    assertThat(node(skipped).path("code").asString()).isEqualTo("PREVIOUS_DAY_NOT_PASSED");
    assertThat(learning.count("learning_sessions", skippedStudent)).isZero();
  }

  @Test
  void startIsJsonSemanticAndReplaysTheImmutableResponseSnapshot() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var requestId = UUID.randomUUID();
    var first =
        startRaw(
            login,
            "{\"mode\":\"FIRST\",\"dayNumber\":1,\"questionIds\":[],\"requestId\":\""
                + requestId
                + "\"}");
    var retry =
        startRaw(
            login,
            "{\"requestId\":\""
                + requestId
                + "\",\"questionIds\":[],\"dayNumber\":1,\"mode\":\"FIRST\"}");

    assertThat(first.getResponse().getStatus()).isEqualTo(200);
    assertThat(retry.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(retry)).isEqualTo(node(first));
    var record =
        idempotency
            .findById(
                new IdempotencyRecordId(
                    student.getId(), IdempotencyOperation.START_SESSION, requestId))
            .orElseThrow();
    assertThat(json.readTree(record.getResponseJson())).isEqualTo(node(first));
    assertThat(learning.count("learning_sessions", student)).isEqualTo(1);

    var reused =
        send("/api/student/learning/sessions", login, startBody(2, requestId));
    assertThat(reused.getResponse().getStatus()).isEqualTo(409);
    assertThat(node(reused).path("code").asString()).isEqualTo("IDEMPOTENCY_KEY_REUSED");
  }

  @Test
  void aNewRequestResumesTheSameTargetAcrossLoginSessionsButConflictsWithAnotherTarget()
      throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 10));
    var firstLogin = client.loginStudent(student);
    var secondLogin = client.loginStudent(student);
    var first =
        send("/api/student/learning/sessions", firstLogin, startBody(1, UUID.randomUUID()));
    var resumed =
        send("/api/student/learning/sessions", secondLogin, startBody(1, UUID.randomUUID()));

    assertThat(resumed.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(resumed).path("sessionId")).isEqualTo(node(first).path("sessionId"));
    assertThat(node(resumed).path("question").path("questionId"))
        .isEqualTo(node(first).path("question").path("questionId"));
    assertThat(node(resumed).path("question").path("deadlineAt"))
        .isEqualTo(node(first).path("question").path("deadlineAt"));

    var conflict =
        send("/api/student/learning/sessions", secondLogin, startBody(2, UUID.randomUUID()));
    assertThat(conflict.getResponse().getStatus()).isEqualTo(409);
    assertThat(node(conflict).path("code").asString()).isEqualTo("SESSION_CONFLICT");
    assertThat(learning.count("learning_sessions", student)).isEqualTo(1);
  }

  @Test
  void concurrentStartsAreSerializedByTheStudentLock() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var firstLogin = client.loginStudent(student);
    var secondLogin = client.loginStudent(student);
    var firstRequest = UUID.randomUUID();
    var secondRequest = UUID.randomUUID();
    var barrier = new CyclicBarrier(2);
    try (var executor = Executors.newFixedThreadPool(2)) {
      var firstFuture =
          executor.submit(
              () -> {
                barrier.await(5, TimeUnit.SECONDS);
                return send(
                    "/api/student/learning/sessions", firstLogin, startBody(1, firstRequest));
              });
      var secondFuture =
          executor.submit(
              () -> {
                barrier.await(5, TimeUnit.SECONDS);
                return send(
                    "/api/student/learning/sessions", secondLogin, startBody(1, secondRequest));
              });
      var first = firstFuture.get(10, TimeUnit.SECONDS);
      var second = secondFuture.get(10, TimeUnit.SECONDS);
      assertThat(first.getResponse().getStatus()).isEqualTo(200);
      assertThat(second.getResponse().getStatus()).isEqualTo(200);
      assertThat(node(first).path("sessionId")).isEqualTo(node(second).path("sessionId"));
      assertThat(node(first).path("question").path("deadlineAt"))
          .isEqualTo(node(second).path("question").path("deadlineAt"));
    }
    assertThat(learning.count("learning_sessions", student)).isEqualTo(1);
    assertThat(learning.count("day_progress", student)).isEqualTo(1);
    assertThat(learning.count("day_attempts", student)).isEqualTo(1);
    assertThat(learning.count("idempotency_records", student)).isEqualTo(2);
    assertThat(jdbc.queryForObject(
        "select count(*) from learning_session_questions q join learning_sessions s"
            + " on s.id=q.session_id where s.student_account_id=?",
        Integer.class, student.getId())).isEqualTo(5);
  }

  @Test
  void sameKeyConcurrentStartsReturnOneExactSnapshotAcrossTwoLogins() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var firstLogin = client.loginStudent(student);
    var secondLogin = client.loginStudent(student);
    var requestId = UUID.randomUUID();
    var barrier = new CyclicBarrier(2);
    try (var executor = Executors.newFixedThreadPool(2)) {
      var first = executor.submit(() -> {
        barrier.await(5, TimeUnit.SECONDS);
        return send("/api/student/learning/sessions", firstLogin, startBody(1, requestId));
      });
      var second = executor.submit(() -> {
        barrier.await(5, TimeUnit.SECONDS);
        return send("/api/student/learning/sessions", secondLogin, startBody(1, requestId));
      });
      var firstResult = first.get(10, TimeUnit.SECONDS);
      var secondResult = second.get(10, TimeUnit.SECONDS);
      assertThat(firstResult.getResponse().getStatus()).isEqualTo(200);
      assertThat(secondResult.getResponse().getStatus()).isEqualTo(200);
      assertThat(node(firstResult)).isEqualTo(node(secondResult));
    }
    assertThat(learning.count("learning_sessions", student)).isEqualTo(1);
    assertThat(learning.count("day_progress", student)).isEqualTo(1);
    assertThat(learning.count("day_attempts", student)).isEqualTo(1);
    assertThat(learning.count("idempotency_records", student)).isEqualTo(1);
  }

  @Test
  void seoulMidnightOpensFirstDayAndDayThirtyIsTheFinalCalendarCap() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    clock.setInstant(Instant.parse("2026-10-11T14:59:59.999999999Z"));
    assertThat(node(status(login)).path("calendarCap").asInt()).isZero();
    var blocked = send("/api/student/learning/sessions", login, startBody(1, UUID.randomUUID()));
    assertThat(blocked.getResponse().getStatus()).isEqualTo(403);
    assertThat(node(blocked).path("code").asString()).isEqualTo("DAY_NOT_YET_AVAILABLE");
    assertThat(learning.count("day_progress", student)).isZero();
    assertThat(learning.count("idempotency_records", student)).isZero();

    clock.setInstant(Instant.parse("2026-10-11T15:00:00Z"));
    assertThat(node(status(login)).path("calendarCap").asInt()).isEqualTo(1);
    var started = send("/api/student/learning/sessions", login, startBody(1, UUID.randomUUID()));
    assertThat(started.getResponse().getStatus()).isEqualTo(200);

    clock.setInstant(Instant.parse("2026-10-12T00:00:00.123456789Z"));
    var finalDay = learning.student(LocalDate.of(2026, 8, 1));
    learning.passedThrough(finalDay, 29);
    var finalLogin = client.loginStudent(finalDay);
    assertThat(node(status(finalLogin)).path("calendarCap").asInt()).isEqualTo(30);
    var finalStart = send("/api/student/learning/sessions", finalLogin, startBody(30, UUID.randomUUID()));
    assertThat(finalStart.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(finalStart).path("question").path("questionId").asInt()).isEqualTo(146);
    assertThat(attempts.findBySessionId(
        UUID.fromString(node(finalStart).path("sessionId").asString())))
        .get().extracting(DayAttempt::isCatchUp).isEqualTo(false);
  }

  @Test
  void firstStartRejectsPassedRetryRequiredAndSkippedRetryDaysWithoutWrites() throws Exception {
    var retry = learning.student(LocalDate.of(2026, 10, 10));
    learning.progress(retry, 1, DayProgressState.RETRY_REQUIRED);
    var retryLogin = client.loginStudent(retry);
    var invalidFirst = send("/api/student/learning/sessions", retryLogin, startBody(1, UUID.randomUUID()));
    assertThat(invalidFirst.getResponse().getStatus()).isEqualTo(409);
    assertThat(node(invalidFirst).path("code").asString()).isEqualTo("SESSION_CONFLICT");
    var skipped = send("/api/student/learning/sessions", retryLogin, startBody(2, UUID.randomUUID()));
    assertThat(skipped.getResponse().getStatus()).isEqualTo(409);
    assertThat(node(skipped).path("code").asString()).isEqualTo("PREVIOUS_DAY_NOT_PASSED");

    var passed = learning.student(LocalDate.of(2026, 10, 10));
    learning.progress(passed, 1, DayProgressState.PASSED);
    var repeatFirst = send("/api/student/learning/sessions", client.loginStudent(passed),
        startBody(1, UUID.randomUUID()));
    assertThat(repeatFirst.getResponse().getStatus()).isEqualTo(400);
    assertThat(node(repeatFirst).path("code").asString()).isEqualTo("VALIDATION_ERROR");
    var inProgress = learning.student(LocalDate.of(2026, 10, 10));
    learning.progress(inProgress, 1, DayProgressState.IN_PROGRESS);
    var restarted = send("/api/student/learning/sessions", client.loginStudent(inProgress),
        startBody(1, UUID.randomUUID()));
    assertThat(restarted.getResponse().getStatus()).isEqualTo(409);
    assertThat(node(restarted).path("code").asString()).isEqualTo("SESSION_CONFLICT");
    for (var account : List.of(retry, passed, inProgress)) {
      assertThat(learning.count("learning_sessions", account)).isZero();
      assertThat(learning.count("day_attempts", account)).isZero();
      assertThat(learning.count("idempotency_records", account)).isZero();
      assertThat(learning.count("day_progress", account)).isEqualTo(1);
    }
  }

  @Test
  void startRetryReturnsEveryOriginalFieldAfterThePersistedSessionMovesOn() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var firstLogin = client.loginStudent(student);
    var requestId = UUID.randomUUID();
    var first = send("/api/student/learning/sessions", firstLogin, startBody(1, requestId));
    assertThat(first.getResponse().getStatus()).isEqualTo(200);
    var sessionId = UUID.fromString(node(first).path("sessionId").asString());
    // Seed later persisted state directly; Task 4 does not implement answering or advance.
    jdbc.update("update learning_sessions set current_position=2,deadline_at=? where id=?",
        Timestamp.from(Instant.parse("2026-10-12T00:01:00.999999Z")), sessionId);
    jdbc.update("update day_attempts set answered_count=1 where session_id=?", sessionId);
    clock.setInstant(Instant.parse("2026-10-12T00:00:40Z"));
    var secondLogin = client.loginStudent(student);
    var current = session(secondLogin, sessionId);
    assertThat(node(current).path("question").path("questionId").asInt()).isEqualTo(2);
    assertThat(node(current).path("answeredCount").asInt()).isEqualTo(1);
    assertThat(node(current)).isNotEqualTo(node(first));

    var retry = startRaw(secondLogin, "{\"requestId\":\"" + requestId
        + "\",\"dayNumber\":1,\"mode\":\"FIRST\"}");
    assertThat(retry.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(retry)).isEqualTo(node(first));
    var resumed = send("/api/student/learning/sessions", secondLogin, startBody(1, UUID.randomUUID()));
    assertThat(node(resumed)).isEqualTo(node(current));
    assertThat(learning.count("learning_sessions", student)).isEqualTo(1);
    assertThat(learning.count("day_attempts", student)).isEqualTo(1);
  }

  @Test
  void resumePreservesTheStoredMicrosecondDeadlineAndStartCatchUpAcrossMidnight() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    clock.setInstant(Instant.parse("2026-10-12T14:59:59.123456789Z"));
    var started = send("/api/student/learning/sessions", login, startBody(1, UUID.randomUUID()));
    assertThat(started.getResponse().getStatus()).isEqualTo(200);
    var sessionId = UUID.fromString(node(started).path("sessionId").asString());
    var persistedDeadline = sessions.findById(sessionId).orElseThrow().getDeadlineAt();
    assertThat(persistedDeadline.getNano() % 1000).isZero();
    assertThat(Instant.parse(node(started).path("question").path("deadlineAt").asString()))
        .isEqualTo(persistedDeadline);
    assertThat(attempts.findBySessionId(sessionId)).get().extracting(DayAttempt::isCatchUp).isEqualTo(false);

    clock.setInstant(Instant.parse("2026-10-12T15:00:00Z"));
    var secondLogin = client.loginStudent(student);
    var resumed = send("/api/student/learning/sessions", secondLogin, startBody(1, UUID.randomUUID()));
    assertThat(resumed.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(resumed)).isEqualTo(node(started));
    var fetched = session(secondLogin, sessionId);
    assertThat(node(fetched)).isEqualTo(node(started));
    assertThat(node(status(secondLogin)).path("calendarCap").asInt()).isEqualTo(2);
    assertThat(attempts.findBySessionId(sessionId)).get().extracting(DayAttempt::isCatchUp).isEqualTo(false);
    assertThat(learning.count("day_attempts", student)).isEqualTo(1);
  }

  private void assertStatus(
      kr.hanbit.school.account.Account student,
      int calendarCap,
      Integer earliest,
      int passed,
      String action)
      throws Exception {
    var result = status(client.loginStudent(student));
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    var body = node(result);
    assertThat(body.path("contentVersion").asString()).isEqualTo("hanbit-v1");
    assertThat(body.path("calendarCap").asInt()).isEqualTo(calendarCap);
    if (earliest == null) assertThat(body.path("earliestUnpassedDay").isNull()).isTrue();
    else assertThat(body.path("earliestUnpassedDay").asInt()).isEqualTo(earliest);
    assertThat(body.path("passedDayCount").asInt()).isEqualTo(passed);
    assertThat(body.path("firstAnswerCount").asInt()).isZero();
    assertThat(body.path("totalXp").asLong()).isZero();
    assertThat(body.path("level").asInt()).isEqualTo(1);
    assertThat(body.path("nextAction").asString()).isEqualTo(action);
  }

  private Map<String, Object> startBody(int day, UUID requestId) {
    return Map.of("mode", "FIRST", "dayNumber", day, "questionIds", java.util.List.of(), "requestId", requestId);
  }

  private record InvalidFirst(String body, String field) {}
}
