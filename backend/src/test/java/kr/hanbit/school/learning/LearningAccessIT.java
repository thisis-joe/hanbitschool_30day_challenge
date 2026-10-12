package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
        .isEqualTo(2);
    var startHash =
        jdbc.queryForObject(
            "select payload_hash from idempotency_records"
                + " where student_account_id=? and operation='START_SESSION' and request_id=?",
            String.class,
            student.getId(),
            requestId);
    assertThat(startHash).matches("[0-9a-f]{64}").isNotEqualTo("a".repeat(64));
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
    var started =
        send("/api/student/learning/sessions", ownerLogin, startBody(UUID.randomUUID()));
    assertThat(started.getResponse().getStatus()).isEqualTo(200);
    var sessionId = UUID.fromString(node(started).path("sessionId").asString());

    var stranger = learning.student(LocalDate.of(2026, 10, 12));
    var hidden = session(client.loginStudent(stranger), sessionId);
    assertThat(hidden.getResponse().getStatus()).isEqualTo(404);
    assertThat(node(hidden).path("code").asString()).isEqualTo("NOT_FOUND");

    try {
      jdbc.update("update content_versions set active=false where version='hanbit-v1'");
      jdbc.update(
          "insert into content_versions(version,digest,active) values ('future-v2',?,true)",
          "d".repeat(64));
      var mismatch = session(ownerLogin, sessionId);
      assertThat(mismatch.getResponse().getStatus()).isEqualTo(409);
      assertThat(node(mismatch).path("code").asString()).isEqualTo("CONTENT_VERSION_MISMATCH");
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
            DayProgressState.IN_PROGRESS, false, false);
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

  private void assertUnauthenticatedWithoutLearningWrites(
      kr.hanbit.school.account.Account student,
      org.springframework.mock.web.MockHttpSession login)
      throws Exception {
    var result = send("/api/student/learning/sessions", login, startBody(UUID.randomUUID()));
    assertThat(result.getResponse().getStatus()).isEqualTo(401);
    assertThat(node(result).path("code").asString()).isEqualTo("UNAUTHENTICATED");
    assertThat(learning.count("day_progress", student)).isZero();
    assertThat(learning.count("learning_sessions", student)).isZero();
  }

  private Map<String, Object> startBody(UUID requestId) {
    return Map.of(
        "mode", "FIRST", "dayNumber", 1, "questionIds", List.of(), "requestId", requestId);
  }
}
