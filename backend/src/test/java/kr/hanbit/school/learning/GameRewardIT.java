package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.hanbit.school.support.GameApiTestSupport;
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
class GameRewardIT extends GameApiTestSupport {
  @Autowired DayProgressRepository progress;
  @Autowired ExpiredLearningSessionProcessor expiry;

  @Test
  void firstThreeOfFivePassGrantsFaceOneWithoutFinish() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var results = complete(login, id, true, true, true, false);
    for (var result : results) assertThat(node(result).path("rewardGranted").isNull()).isTrue();
    advanceOk(login, id);
    var request = UUID.randomUUID();
    var fifth = answer(login, id, request, 5, choice(5, false));
    var granted = node(fifth).path("rewardGranted");
    assertThat(granted.path("itemId").asString()).isEqualTo("face-1");
    assertThat(granted.path("dayNumber").asInt()).isEqualTo(1);
    assertThat(granted.path("acquiredAt").asString()).isEqualTo("2026-10-12T00:00:00.123456Z");
    assertThat(node(fifth).path("xpAwarded").asInt()).isEqualTo(1500);
    assertThat(node(fifth).path("totalXp").asLong()).isEqualTo(3945);
    assertThat(node(session(client.loginStudent(student), id)).path("lastAnswer"))
        .isEqualTo(node(fifth));
    assertThat(node(answer(login, id, request, 5, choice(5, false)))).isEqualTo(node(fifth));
    assertThat(learning.count("first_answers", student)).isEqualTo(5);
    assertThat(learning.count("xp_entries", student)).isEqualTo(6);
    var row =
        progress
            .findByStudentAccountIdAndVersionAndDay(student.getId(), "hanbit-v1", 1)
            .orElseThrow();
    assertThat(Instant.parse(granted.path("acquiredAt").asString())).isEqualTo(row.getPassedAt());
    assertThat(node(getGame(login)).path("inventory").get(0).path("itemId").asString())
        .isEqualTo("face-1");
    assertThat(node(getGame(login)).path("inventory").get(0).path("owned").asBoolean()).isTrue();
  }

  @Test
  void failedFirstThenReplayPassGrantsOnlyOnce() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var failed = complete(login, id, true, true, false, false, false);
    assertThat(node(failed.get(4)).path("rewardGranted").isNull()).isTrue();
    var original =
        jdbc.queryForList(
            "select * from first_answers where student_account_id=? order by question_id",
            student.getId());
    var replay =
        sessionId(
            send(
                "/api/student/learning/sessions",
                login,
                Map.of(
                    "requestId", UUID.randomUUID(), "mode", "REPLAY",
                    "dayNumber", 1, "questionIds", List.of())));
    var passed = complete(login, replay, true, true, true, false, false);
    assertThat(node(passed.get(4)).path("rewardGranted").path("itemId").asString()).isEqualTo("face-1");
    assertThat(node(passed.get(4)).path("xpAwarded").asInt()).isEqualTo(1126);
    var firstPass =
        progress
            .findByStudentAccountIdAndVersionAndDay(student.getId(), "hanbit-v1", 1)
            .orElseThrow();
    assertThat(
            Instant.parse(node(passed.get(4)).path("rewardGranted").path("acquiredAt").asString()))
        .isEqualTo(firstPass.getPassedAt());
    assertThat(
            jdbc.queryForList(
                "select amount from xp_entries where student_account_id=? and kind='REPEAT_ANSWER'",
                Integer.class,
                student.getId()))
        .containsExactly(1, 1, 1, 1, 1);
    var repeat =
        sessionId(
            send(
                "/api/student/learning/sessions",
                login,
                Map.of(
                    "requestId", UUID.randomUUID(), "mode", "REPLAY",
                    "dayNumber", 1, "questionIds", List.of())));
    var repeated = complete(login, repeat, false, false, false, false, false);
    assertThat(node(repeated.get(4)).path("rewardGranted").isNull()).isTrue();
    assertThat(node(repeated.get(4)).path("dayState").asString()).isEqualTo("PASSED");
    assertThat(
            jdbc.queryForObject(
                "select count(*) from xp_entries where student_account_id=? and kind='FIRST_DAY_PASS'",
                Integer.class,
                student.getId()))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForList(
                "select * from first_answers where student_account_id=? order by question_id",
                student.getId()))
        .isEqualTo(original);
    assertThat(progress.findById(firstPass.getId()).orElseThrow().getPassedAt())
        .isEqualTo(firstPass.getPassedAt());
  }

  @Test
  void expiredFifthAnswerGrantsTheSamePassReward() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    complete(login, id, true, true, true, false);
    var fifth = advanceOk(login, id);
    var observed = deadline(node(fifth)).plusNanos(789);
    var original =
        jdbc.queryForList(
            "select * from first_answers where student_account_id=? order by question_id",
            student.getId());
    expiry.expireOne(id, observed);
    var result = node(session(login, id)).path("lastAnswer");
    assertThat(result.path("outcome").asString()).isEqualTo("TIMED_OUT");
    assertThat(result.path("rewardGranted").path("itemId").asString()).isEqualTo("face-1");
    var day =
        progress
            .findByStudentAccountIdAndVersionAndDay(student.getId(), "hanbit-v1", 1)
            .orElseThrow();
    assertThat(Instant.parse(result.path("rewardGranted").path("acquiredAt").asString()))
        .isEqualTo(day.getPassedAt());
    assertThat(day.getPassedAt()).isEqualTo(deadline(node(fifth)));
    expiry.expireOne(id, observed.plusSeconds(1));
    assertThat(node(session(login, id)).path("lastAnswer")).isEqualTo(result);
    assertThat(learning.count("first_answers", student)).isEqualTo(5);
    assertThat(learning.count("xp_entries", student)).isEqualTo(6);
    assertThat(
            jdbc.queryForList(
                "select * from first_answers where student_account_id=? and question_id<5 order by question_id",
                student.getId()))
        .isEqualTo(original);
  }

  @Test
  void legacyAnswerJsonRestoresNullReward() throws Exception {
    var legacy =
        """
        {"attemptAnswerId":"00000000-0000-0000-0000-000000000001","questionId":5,
         "outcome":"WRONG","correctChoice":"O","explanation":"이전 결과",
         "xpAwarded":1498,"totalXp":3939,"level":2,"attemptCorrectCount":3,
         "attemptAnsweredCount":5,"attemptState":"PASSED","dayState":"PASSED",
         "nextDayAvailable":true,"reviewPromptEligible":false}
        """;
    var restored = json.readTree(json.writeValueAsString(json.readValue(legacy, AnswerResult.class)));
    assertThat(restored.has("rewardGranted")).isTrue();
    assertThat(restored.path("rewardGranted").isNull()).isTrue();
    var original = json.readTree(legacy);
    original
        .properties()
        .forEach(entry -> assertThat(restored.path(entry.getKey())).isEqualTo(entry.getValue()));
  }
}
