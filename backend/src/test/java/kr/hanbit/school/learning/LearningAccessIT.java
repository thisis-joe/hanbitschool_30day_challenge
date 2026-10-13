package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.hanbit.school.account.AuthenticationModule;
import kr.hanbit.school.shared.web.ApiException;
import kr.hanbit.school.support.LearningApiTestSupport;
import kr.hanbit.school.support.LearningTestClockConfiguration;
import kr.hanbit.school.support.PostgresTestConfiguration;
import kr.hanbit.school.support.SessionTestClient;
import org.junit.jupiter.api.Test;
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
class LearningAccessIT extends LearningApiTestSupport {
  @org.springframework.beans.factory.annotation.Autowired LearningIdempotency learningIdempotency;
  @org.springframework.beans.factory.annotation.Autowired LearningSessionModule module;

  @Test
  void studentEndpointsRequireAStudentLoginAndCsrf() throws Exception {
    mvc.perform(get("/api/student/learning/status"))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());

    var school = fixtures.school("교직원 접근 학교");
    var staff = fixtures.teacher(school);
    mvc.perform(get("/api/student/learning/status").session(client.loginStaff(staff)))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());

    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var withoutCsrf =
        mvc.perform(
                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(
                        "/api/student/learning/sessions")
                    .session(login)
                    .contentType("application/json")
                    .content(json.writeValueAsString(startBody(UUID.randomUUID()))))
            .andReturn();
    assertThat(withoutCsrf.getResponse().getStatus()).isEqualTo(403);
    assertThat(node(withoutCsrf).path("code").asString()).isEqualTo("INVALID_CSRF_TOKEN");
  }

  @Test
  void brokenStudentContextFailsBeforeWrite() throws Exception {
    var missingProfile = learning.student(LocalDate.of(2026, 10, 12));
    var missingLogin = client.loginStudent(missingProfile);
    jdbc.update("delete from student_profiles where account_id=?", missingProfile.getId());
    assertUnauthenticatedWithoutLearningWrites(missingProfile, missingLogin);

    var movedProfile = learning.student(LocalDate.of(2026, 10, 12));
    var movedLogin = client.loginStudent(movedProfile);
    var otherSchool = fixtures.school("다른 학교");
    var otherClassroom =
        fixtures.classroom(
            otherSchool,
            fixtures.teacher(otherSchool),
            "1학년",
            1,
            LocalDate.of(2026, 10, 12));
    jdbc.update(
        "update student_profiles set classroom_id=? where account_id=?",
        otherClassroom.getId(),
        movedProfile.getId());
    assertUnauthenticatedWithoutLearningWrites(movedProfile, movedLogin);
  }

  @Test
  void brokenStudentContextTakesPrecedenceOverInvalidFirstPayload() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    jdbc.update("delete from student_profiles where account_id=?", student.getId());

    var result =
        startRaw(
            login,
            "{\"mode\":\"FIRST\",\"dayNumber\":0,\"questionIds\":[1],\"requestId\":\""
                + UUID.randomUUID()
                + "\"}");

    assertThat(result.getResponse().getStatus()).isEqualTo(401);
    assertThat(node(result).path("code").asString()).isEqualTo("UNAUTHENTICATED");
    assertThat(learning.count("day_progress", student)).isZero();
    assertThat(learning.count("learning_sessions", student)).isZero();
  }

  @Test
  void idempotencyUsesTypedPayloadAndOperationScope() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var requestId = UUID.randomUUID();
    learning.idempotency(
        student,
        "SUBMIT_ANSWER",
        requestId,
        "a".repeat(64),
        "{\"operation\":\"answer\"}");
    learning.idempotency(
        student, "ADVANCE_SESSION", requestId, "b".repeat(64), "{\"operation\":\"advance\"}");

    var started =
        send(
            "/api/student/learning/sessions",
            client.loginStudent(student),
            startBody(requestId));

    assertThat(started.getResponse().getStatus()).isEqualTo(200);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from idempotency_records"
                    + " where student_account_id=? and request_id=?",
                Integer.class,
                student.getId(),
                requestId))
        .isEqualTo(3);
    var startHash =
        jdbc.queryForObject(
            "select payload_hash from idempotency_records"
                + " where student_account_id=? and operation='START_SESSION' and request_id=?",
            String.class,
            student.getId(),
            requestId);
    assertThat(startHash).matches("[0-9a-f]{64}").isNotEqualTo("a".repeat(64));
    var stranger = learning.student(LocalDate.of(2026, 10, 12));
    var strangerStart = send("/api/student/learning/sessions", client.loginStudent(stranger),
        startBody(requestId));
    assertThat(strangerStart.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(strangerStart).path("sessionId")).isNotEqualTo(node(started).path("sessionId"));
    assertThat(learning.count("idempotency_records", stranger)).isEqualTo(1);
  }

  @Test
  void anIdempotencyResponseSnapshotCannotBeOverwritten() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var requestId = UUID.randomUUID();
    var started =
        send(
            "/api/student/learning/sessions",
            client.loginStudent(student),
            startBody(requestId));
    assertThat(started.getResponse().getStatus()).isEqualTo(200);
    String hash =
        jdbc.queryForObject(
            "select payload_hash from idempotency_records"
                + " where student_account_id=? and operation='START_SESSION' and request_id=?",
            String.class,
            student.getId(),
            requestId);
    String snapshot =
        jdbc.queryForObject(
            "select response_json::text from idempotency_records"
                + " where student_account_id=? and operation='START_SESSION' and request_id=?",
            String.class,
            student.getId(),
            requestId);

    assertThatThrownBy(
            () ->
                learningIdempotency.record(
                    student.getId(),
                    IdempotencyOperation.START_SESSION,
                    requestId,
                    hash,
                    Map.of("tampered", true)))
        .isInstanceOf(RuntimeException.class);
    assertThat(
            jdbc.queryForObject(
                "select response_json::text from idempotency_records"
                    + " where student_account_id=? and operation='START_SESSION' and request_id=?",
                String.class,
                student.getId(),
                requestId))
        .isEqualTo(snapshot);
  }

  @Test
  void anotherStudentsSessionIsHiddenAndAnActiveContentMismatchFailsClosed() throws Exception {
    var owner = learning.student(LocalDate.of(2026, 10, 12));
    var ownerLogin = client.loginStudent(owner);
    var originalRequestId = UUID.randomUUID();
    var started =
        send("/api/student/learning/sessions", ownerLogin, startBody(originalRequestId));
    assertThat(started.getResponse().getStatus()).isEqualTo(200);
    var sessionId = UUID.fromString(node(started).path("sessionId").asString());

    var stranger = learning.student(LocalDate.of(2026, 10, 12));
    var hidden = session(client.loginStudent(stranger), sessionId);
    assertThat(hidden.getResponse().getStatus()).isEqualTo(404);
    assertThat(node(hidden).path("code").asString()).isEqualTo("NOT_FOUND");
    var absent = session(client.loginStudent(stranger), UUID.randomUUID());
    assertThat(absent.getResponse().getStatus()).isEqualTo(404);
    assertThat(node(hidden)).isEqualTo(node(absent));

    try {
      jdbc.update("update content_versions set active=false where version='hanbit-v1'");
      jdbc.update(
          "insert into content_versions(version,digest,active) values ('future-v2',?,true)",
          "d".repeat(64));
      var mismatch = session(ownerLogin, sessionId);
      assertThat(mismatch.getResponse().getStatus()).isEqualTo(409);
      assertThat(node(mismatch).path("code").asString()).isEqualTo("CONTENT_VERSION_MISMATCH");
      var mismatchedStatus = status(ownerLogin);
      var mismatchedNewStart = send("/api/student/learning/sessions", ownerLogin,
          startBody(UUID.randomUUID()));
      var mismatchedRetry = send("/api/student/learning/sessions", ownerLogin,
          startBody(originalRequestId));
      for (var response : List.of(mismatchedStatus, mismatchedNewStart, mismatchedRetry)) {
        assertThat(response.getResponse().getStatus()).isEqualTo(409);
        assertThat(node(response).path("code").asString()).isEqualTo("CONTENT_VERSION_MISMATCH");
      }
      assertThat(learning.count("learning_sessions", owner)).isEqualTo(1);
      assertThat(learning.count("idempotency_records", owner)).isEqualTo(1);
    } finally {
      jdbc.update("delete from content_versions where version='future-v2'");
      jdbc.update("update content_versions set active=true where version='hanbit-v1'");
    }
  }

  @Test
  void anActiveQuestionNeverExposesStalePersistedFeedback() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var requestId = UUID.randomUUID();
    var started = send("/api/student/learning/sessions", login, startBody(requestId));
    assertThat(started.getResponse().getStatus()).isEqualTo(200);
    var sessionId = UUID.fromString(node(started).path("sessionId").asString());
    var staleFeedback =
        new AnswerResult(
            UUID.randomUUID(), 1, AnswerOutcome.CORRECT,
            kr.hanbit.school.content.AnswerChoice.O, "서버에만 남아야 하는 이전 해설",
            565, 565, 1, 1, 1, DayAttemptState.ACTIVE,
            DayProgressState.IN_PROGRESS, false, false, null);
    jdbc.update("update learning_sessions set last_result_json=cast(? as jsonb) where id=?",
        json.writeValueAsString(staleFeedback), sessionId);

    var fetched = session(login, sessionId);
    var resumed = send("/api/student/learning/sessions", login, startBody(UUID.randomUUID()));
    var currentStatus = status(login);
    assertThat(fetched.getResponse().getStatus()).isEqualTo(200);
    assertThat(resumed.getResponse().getStatus()).isEqualTo(200);
    assertThat(currentStatus.getResponse().getStatus()).isEqualTo(200);
    for (var view : List.of(node(fetched), node(resumed), node(currentStatus).path("activeSession"))) {
      assertThat(view.path("state").asString()).isEqualTo("QUESTION_ACTIVE");
      assertThat(view.path("lastAnswer").isNull()).isTrue();
      assertThat(view.toString()).doesNotContain("correctChoice", "explanation");
    }
    assertThat(json.readTree(jdbc.queryForObject(
        "select last_result_json::text from learning_sessions where id=?",
        String.class, sessionId))).isEqualTo(json.readTree(json.writeValueAsString(staleFeedback)));
    var retry = send("/api/student/learning/sessions", login, startBody(requestId));
    assertThat(node(retry)).isEqualTo(node(started));
    assertThat(learning.count("first_answers", student)).isZero();
  }

  @Test
  void moduleAuthenticationAndStudentContextTakePrecedenceOverAllCommandValidation() {
    var school = fixtures.school("모듈 역할 검증 학교");
    var staff = fixtures.teacher(school);
    var staffPrincipal = AuthenticationModule.principal(staff);
    assertApiError(() -> module.start(staffPrincipal, null), 403, "FORBIDDEN");
    assertApiError(() -> module.status(staffPrincipal), 403, "FORBIDDEN");
    assertApiError(() -> module.session(staffPrincipal, UUID.randomUUID()), 403, "FORBIDDEN");
    assertApiError(() -> module.start(null, null), 401, "UNAUTHENTICATED");

    var student = learning.student(LocalDate.of(2026, 10, 12));
    var principal = AuthenticationModule.principal(student);
    jdbc.update("delete from student_profiles where account_id=?", student.getId());
    assertApiError(() -> module.start(principal, null), 401, "UNAUTHENTICATED");
    for (var command : List.of(
        new StartLearningSessionCommand(null, null, null, null),
        new StartLearningSessionCommand(LearningMode.REVIEW, 0, List.of(1), UUID.randomUUID()),
        new StartLearningSessionCommand(LearningMode.FIRST, 31, List.of(), UUID.randomUUID()))) {
      assertApiError(() -> module.start(principal, command), 401, "UNAUTHENTICATED");
    }
    assertApiError(() -> module.status(principal), 401, "UNAUTHENTICATED");
    assertApiError(() -> module.session(principal, UUID.randomUUID()), 401, "UNAUTHENTICATED");
    assertNoLearningWrites(student);
  }

  @Test
  void studentOwnershipComesFromThePrincipalEvenWhenTheBodyNamesAnotherStudent() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var stranger = learning.student(LocalDate.of(2026, 10, 12));
    var body = new java.util.HashMap<String, Object>(startBody(UUID.randomUUID()));
    body.put("studentAccountId", stranger.getId());
    var started = send("/api/student/learning/sessions", client.loginStudent(student), body);
    assertThat(started.getResponse().getStatus()).isEqualTo(200);
    assertThat(learning.count("learning_sessions", student)).isEqualTo(1);
    assertThat(learning.count("learning_sessions", stranger)).isZero();
    assertThat(learning.count("day_progress", stranger)).isZero();
    assertThat(learning.count("idempotency_records", stranger)).isZero();
    assertThat(node(started).toString())
        .doesNotContain("studentAccountId", "correctChoice", "explanation", "password");
  }

  @Test
  void statusCountsOnlyThePrincipalsProgressAnswersAndXpLedger() throws Exception {
    var owner = learning.student(LocalDate.of(2026, 10, 10));
    var stranger = learning.student(LocalDate.of(2026, 10, 10));
    var ownerLogin = client.loginStudent(owner);
    var ownerStart = send("/api/student/learning/sessions", ownerLogin, startBody(UUID.randomUUID()));
    var strangerStart = send("/api/student/learning/sessions", client.loginStudent(stranger),
        startBody(UUID.randomUUID()));
    assertThat(ownerStart.getResponse().getStatus()).isEqualTo(200);
    assertThat(strangerStart.getResponse().getStatus()).isEqualTo(200);
    insertFirstAnswer(owner, UUID.fromString(node(ownerStart).path("sessionId").asString()), 1);
    var strangerSession = UUID.fromString(node(strangerStart).path("sessionId").asString());
    insertFirstAnswer(stranger, strangerSession, 1);
    insertFirstAnswer(stranger, strangerSession, 2);
    learning.progress(stranger, 2, DayProgressState.PASSED);
    learning.progress(stranger, 3, DayProgressState.PASSED);
    for (var entry : List.of(Map.entry(owner, 3750), Map.entry(stranger, 7500))) {
      jdbc.update("insert into xp_entries"
          + "(id,student_account_id,kind,source_id,amount,rule_version,created_at)"
          + " values (?,?,'FIRST_ANSWER',?,?,'learning-v1',?)",
          UUID.randomUUID(), entry.getKey().getId(), UUID.randomUUID(), entry.getValue(),
          java.sql.Timestamp.from(LearningTime.persistable(clock.instant())));
    }

    var response = status(ownerLogin);
    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    var body = node(response);
    assertThat(body.path("calendarCap").asInt()).isEqualTo(3);
    assertThat(body.path("earliestUnpassedDay").asInt()).isEqualTo(1);
    assertThat(body.path("passedDayCount").asInt()).isZero();
    assertThat(body.path("firstAnswerCount").asInt()).isEqualTo(1);
    assertThat(body.path("totalXp").asLong()).isEqualTo(3750);
    assertThat(body.path("level").asInt()).isEqualTo(2);
    assertThat(body.path("activeSession").path("sessionId"))
        .isEqualTo(node(ownerStart).path("sessionId"));
    assertThat(body.toString()).doesNotContain("studentAccountId", "correctChoice", "explanation");
  }

  @Test
  void failureToPersistTheStartSnapshotRollsBackEveryLearningRow() {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var function = "task4_fail_start_" + UUID.randomUUID().toString().replace("-", "");
    jdbc.execute("create function " + function + "() returns trigger language plpgsql as $$"
        + " begin if NEW.student_account_id='" + student.getId() + "'::uuid"
        + " and NEW.operation='START_SESSION' then"
        + " raise exception 'forced Task 4 start rollback'; end if; return NEW; end; $$");
    try {
      jdbc.execute("create trigger " + function + " before insert on idempotency_records"
          + " for each row execute function " + function + "()");
      try {
        assertThatThrownBy(() -> module.start(AuthenticationModule.principal(student),
            new StartLearningSessionCommand(LearningMode.FIRST, 1, List.of(), UUID.randomUUID())))
            .hasStackTraceContaining("forced Task 4 start rollback");
        assertNoLearningWrites(student);
      } finally {
        jdbc.execute("drop trigger " + function + " on idempotency_records");
      }
    } finally {
      jdbc.execute("drop function " + function + "()");
    }
  }

  private void assertUnauthenticatedWithoutLearningWrites(
      kr.hanbit.school.account.Account student,
      org.springframework.mock.web.MockHttpSession login)
      throws Exception {
    var result = send("/api/student/learning/sessions", login, startBody(UUID.randomUUID()));
    assertThat(result.getResponse().getStatus()).isEqualTo(401);
    assertThat(node(result).path("code").asString()).isEqualTo("UNAUTHENTICATED");
    assertNoLearningWrites(student);
  }

  private void assertNoLearningWrites(kr.hanbit.school.account.Account student) {
    for (String table : List.of("day_progress", "learning_sessions", "day_attempts",
        "first_answers", "last_answers", "xp_entries", "idempotency_records")) {
      assertThat(learning.count(table, student)).as(table).isZero();
    }
    assertThat(jdbc.queryForObject(
        "select count(*) from learning_session_questions q join learning_sessions s"
            + " on s.id=q.session_id where s.student_account_id=?",
        Integer.class, student.getId())).isZero();
  }

  private void assertApiError(org.assertj.core.api.ThrowableAssert.ThrowingCallable operation,
      int status, String code) {
    assertThatThrownBy(operation).isInstanceOfSatisfying(ApiException.class, error -> {
      assertThat(error.status()).isEqualTo(status);
      assertThat(error.code()).isEqualTo(code);
    });
  }

  private void insertFirstAnswer(kr.hanbit.school.account.Account student, UUID sessionId,
      int questionId) {
    var attemptId = jdbc.queryForObject("select id from day_attempts where session_id=?",
        UUID.class, sessionId);
    jdbc.update("insert into first_answers"
        + "(id,student_account_id,version,question_id,session_id,day_attempt_id,request_id,"
        + "choice,timed_out,correct,answered_at,response_millis)"
        + " values (?,?,'hanbit-v1',?,?,?,?,'O',false,true,?,0)",
        UUID.randomUUID(), student.getId(), questionId, sessionId, attemptId, UUID.randomUUID(),
        java.sql.Timestamp.from(LearningTime.persistable(clock.instant())));
  }

  private Map<String, Object> startBody(UUID requestId) {
    return Map.of(
        "mode", "FIRST", "dayNumber", 1, "questionIds", List.of(), "requestId", requestId);
  }
}
