package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.hanbit.school.support.GameApiTestSupport;
import kr.hanbit.school.support.LearningTestClockConfiguration;
import kr.hanbit.school.support.PostgresTestConfiguration;
import kr.hanbit.school.support.SessionTestClient;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import tools.jackson.databind.JsonNode;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({
  PostgresTestConfiguration.class,
  LearningTestClockConfiguration.class,
  SessionTestClient.class
})
class JourneyIT extends GameApiTestSupport {
  @Test
  void allFirstAnswersWithoutLastPassIsNotCourseComplete() throws Exception {
    var student = learning.student(LocalDate.of(2026, 9, 13));
    var login = client.loginStudent(student);
    for (int day = 1; day <= 30; day++) {
      var id = sessionId(startDay(login, day, UUID.randomUUID()));
      complete(login, id, day < 30, day < 30, day < 30, false, false);
    }
    var view = map(login);
    assertThat(view.path("firstAnswerCount").asInt()).isEqualTo(150);
    assertThat(view.path("journeyPosition").asInt()).isEqualTo(150);
    assertThat(view.path("courseCompleted").asBoolean()).isFalse();
    assertThat(view.path("nextAction").asString()).isEqualTo("START_REPLAY");
    assertThat(view.path("days").get(29).path("rewardItemId").asString()).isEqualTo("hand-5");
    assertThat(view.path("days").get(29).path("rewardOwned").asBoolean()).isFalse();
    var replay =
        sessionId(
            send(
                "/api/student/learning/sessions",
                login,
                Map.of(
                    "requestId", UUID.randomUUID(), "mode", "REPLAY",
                    "dayNumber", 30, "questionIds", List.of())));
    complete(login, replay, true, true, true, false, false);
    var completed = map(login);
    assertThat(completed.path("courseCompleted").asBoolean()).isTrue();
    assertThat(completed.path("journeyPosition").asInt()).isEqualTo(150);
    assertThat(completed.path("nextAction").asString()).isEqualTo("COURSE_COMPLETE");
    assertThat(completed.path("days").get(29).path("rewardOwned").asBoolean()).isTrue();
  }

  @Test
  void firstWrongAndTimeoutMoveButRepeatsDoNot() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    answerCurrent(login, id, false);
    assertThat(map(login).path("journeyPosition").asInt()).isEqualTo(1);
    advanceOk(login, id);
    clock.setInstant(deadline(node(session(login, id))).plusNanos(1));
    answerCurrent(login, id, true);
    var view = map(login);
    assertThat(view.path("firstAnswerCount").asInt()).isEqualTo(2);
    assertThat(view.path("journeyPosition").asInt()).isEqualTo(2);
    assertThat(view.path("questions").get(0).path("outcome").asString()).isEqualTo("WRONG");
    assertThat(view.path("questions").get(1).path("outcome").asString()).isEqualTo("TIMED_OUT");
    assertThat(view.path("questions").get(2).path("outcome").asString()).isEqualTo("UNANSWERED");
    assertThat(view.path("days").get(0).path("firstAnsweredCount").asInt()).isEqualTo(2);
    advanceOk(login, id);
    complete(login, id, false, false, false);
    var review =
        sessionId(
            send(
                "/api/student/learning/sessions",
                login,
                Map.of("requestId", UUID.randomUUID(), "mode", "REVIEW", "questionIds", List.of(1))));
    var reviewing = map(login);
    assertThat(reviewing.path("activeSessionId").asString()).isEqualTo(review.toString());
    assertThat(reviewing.path("nextAction").asString()).isEqualTo("CONTINUE_SESSION");
    assertError(
        send("/api/student/learning/sessions", login, startBody(1, UUID.randomUUID())),
        409,
        "SESSION_CONFLICT");
    assertThat(node(answerCurrent(login, review, true)).path("rewardGranted").isNull()).isTrue();
    var afterReview = map(login);
    assertThat(afterReview.path("journeyPosition").asInt()).isEqualTo(5);
    assertThat(afterReview.path("questions").get(0).path("outcome").asString()).isEqualTo("WRONG");
    var replay =
        sessionId(
            send(
                "/api/student/learning/sessions",
                login,
                Map.of(
                    "requestId", UUID.randomUUID(), "mode", "REPLAY",
                    "dayNumber", 1, "questionIds", List.of())));
    complete(login, replay, true, true, true, true, true);
    assertThat(map(login).path("journeyPosition").asInt()).isEqualTo(5);
    assertThat(map(login).path("questions")).isEqualTo(afterReview.path("questions"));
  }

  @Test
  void dateAndPreviousPassLocksRemainServerAuthoritative() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 11));
    var login = client.loginStudent(student);
    var view = map(login);
    assertThat(view.path("contentVersion").asString()).isEqualTo("hanbit-v1");
    assertThat(view.path("calendarCap").asInt()).isEqualTo(2);
    assertThat(view.path("nextAction").asString()).isEqualTo("START_FIRST");
    assertThat(view.path("activeSessionId").isNull()).isTrue();
    assertThat(view.path("days").size()).isEqualTo(30);
    assertThat(view.path("questions").size()).isEqualTo(150);
    assertThat(view.path("days").get(0).path("availability").asString()).isEqualTo("AVAILABLE");
    assertThat(view.path("days").get(1).path("availability").asString()).isEqualTo("LOCKED_PREVIOUS");
    assertThat(view.path("days").get(2).path("availability").asString()).isEqualTo("LOCKED_DATE");
    assertError(
        send("/api/student/learning/sessions", login, startBody(2, UUID.randomUUID())),
        409,
        "PREVIOUS_DAY_NOT_PASSED");
    assertError(
        send("/api/student/learning/sessions", login, startBody(3, UUID.randomUUID())),
        403,
        "DAY_NOT_YET_AVAILABLE");
    for (int i = 0; i < 30; i++) {
      assertThat(view.path("days").get(i).path("dayNumber").asInt()).isEqualTo(i + 1);
      assertThat(view.path("days").get(i).path("state").asString()).isEqualTo("NOT_STARTED");
    }
    for (int i = 0; i < 150; i++) {
      var question = view.path("questions").get(i);
      assertThat(question.path("questionId").asInt()).isEqualTo(i + 1);
      assertThat(question.path("dayNumber").asInt()).isEqualTo(i / 5 + 1);
      assertThat(question.path("position").asInt()).isEqualTo(i % 5 + 1);
      assertThat(question.properties().stream().map(Map.Entry::getKey).toList())
          .containsExactlyInAnyOrder("questionId", "dayNumber", "position", "outcome");
    }
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    assertThat(map(login).path("activeSessionId").asString()).isEqualTo(id.toString());
    assertThat(map(login).path("nextAction").asString()).isEqualTo("CONTINUE_SESSION");
    complete(login, id, true, true, true, false, false);
    var passed = map(login);
    assertThat(passed.path("days").get(0).path("availability").asString()).isEqualTo("PASSED");
    assertThat(passed.path("days").get(0).path("rewardOwned").asBoolean()).isTrue();
    assertThat(passed.path("days").get(1).path("availability").asString()).isEqualTo("AVAILABLE");
    var other = learning.student(LocalDate.of(2026, 10, 13));
    var beforeStart = map(client.loginStudent(other));
    assertThat(beforeStart.path("firstAnswerCount").asInt()).isZero();
    assertThat(beforeStart.path("nextAction").asString()).isEqualTo("WAIT_FOR_START_DATE");
    assertThat(beforeStart.path("days").get(0).path("availability").asString()).isEqualTo("LOCKED_DATE");
  }

  private JsonNode map(MockHttpSession login) throws Exception {
    var response = mvc.perform(get("/api/student/learning/map").session(login)).andReturn();
    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    return node(response);
  }
}
