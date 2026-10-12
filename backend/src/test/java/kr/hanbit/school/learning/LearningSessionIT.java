package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
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
    try (var executor = Executors.newFixedThreadPool(2)) {
      var results =
          executor.invokeAll(
              java.util.List.<Callable<org.springframework.test.web.servlet.MvcResult>>of(
                  () ->
                      send(
                          "/api/student/learning/sessions",
                          firstLogin,
                          startBody(1, firstRequest)),
                  () ->
                      send(
                          "/api/student/learning/sessions",
                          secondLogin,
                          startBody(1, secondRequest))));
      var first = results.get(0).get();
      var second = results.get(1).get();
      assertThat(first.getResponse().getStatus()).isEqualTo(200);
      assertThat(second.getResponse().getStatus()).isEqualTo(200);
      assertThat(node(first).path("sessionId")).isEqualTo(node(second).path("sessionId"));
      assertThat(node(first).path("question").path("deadlineAt"))
          .isEqualTo(node(second).path("question").path("deadlineAt"));
    }
    assertThat(learning.count("learning_sessions", student)).isEqualTo(1);
    assertThat(learning.count("day_progress", student)).isEqualTo(1);
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
}
