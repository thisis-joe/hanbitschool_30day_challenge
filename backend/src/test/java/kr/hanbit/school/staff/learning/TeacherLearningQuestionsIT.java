package kr.hanbit.school.staff.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.*;
import kr.hanbit.school.classroom.Classroom;
import kr.hanbit.school.support.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password=",
    "spring.jpa.properties.hibernate.session_factory.statement_inspector=kr.hanbit.school.staff.learning.TeacherLearningOverviewIT$SqlCapture"})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({PostgresTestConfiguration.class, LearningTestClockConfiguration.class, SessionTestClient.class})
class TeacherLearningQuestionsIT extends LearningAnswerTestSupport {
  @Test
  void questionRatesUseActualRespondentsAndExcludeUntouchedFromWrong() throws Exception {
    var school = fixtures.school("문항 분모");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var correct = fixtures.student(classroom, 1, "정답", "개인");
    var timeout = fixtures.student(classroom, 2, "시간초과", "개인");
    fixtures.student(classroom, 3, "미응답", "개인");
    var learner = client.loginStudent(correct);
    answerCurrent(learner, sessionId(startDay(learner, 1, UUID.randomUUID())), true);
    var late = client.loginStudent(timeout);
    var active = sessionId(startDay(late, 1, UUID.randomUUID()));
    clock.setInstant(deadline(node(session(late, active))).plusNanos(1));
    answerCurrent(late, active, true);
    var staff = client.loginStaff(teacher);
    var detail = question(staff, classroom, 1);
    assertThat(detail.getResponse().getStatus()).isEqualTo(200);
    var result = node(detail);
    var row = result.path("question");
    assertThat(row.path("answered").asInt()).isEqualTo(2);
    assertThat(row.path("correct").asInt()).isEqualTo(1);
    assertThat(row.path("wrongRate").asDouble()).isEqualTo(0.5);
    assertThat(row.path("timedOut").asInt()).isEqualTo(1);
    assertThat(row.path("unanswered").asInt()).isEqualTo(1);
    assertThat(row.path("choiceWrong").asInt()).isZero();
    assertThat(result.path("explanation").asString()).isEqualTo(content.requireQuestion("hanbit-v1", 1).getExplanation());
    assertThat(result.path("correct")).hasSize(1);
    assertThat(result.path("correct").get(0).path("accountId").asString()).isEqualTo(correct.getId().toString());
    assertThat(result.path("correct").get(0).path("firstChoice").asString()).isEqualTo("O");
    assertThat(result.path("correct").get(0).path("outcome").asString()).isEqualTo("CORRECT");
    assertThat(result.path("wrong")).hasSize(1);
    assertThat(result.path("wrong").get(0).path("accountId").asString()).isEqualTo(timeout.getId().toString());
    assertThat(result.path("wrong").get(0).path("firstChoice").isNull()).isTrue();
    assertThat(result.path("wrong").get(0).path("outcome").asString()).isEqualTo("TIMED_OUT");
    assertThat(result.path("unanswered").asInt()).isEqualTo(1);
    assertThat(result.properties()).extracting(Map.Entry::getKey).containsExactlyInAnyOrder("question", "explanation", "correct", "wrong", "unanswered");
    var untouched = node(question(staff, classroom, 2));
    assertThat(untouched.path("wrong")).isEmpty();
    assertThat(untouched.path("question").path("wrongRate").isNull()).isTrue();
    assertThat(untouched.path("unanswered").asInt()).isEqualTo(3);
  }

  @Test
  void wrongRateSortIsStableWithNullLast() throws Exception {
    var school = fixtures.school("문항 정렬");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var a = fixtures.student(classroom, 1, "첫째", "개인");
    var b = fixtures.student(classroom, 2, "둘째", "개인");
    var first = client.loginStudent(a);
    complete(first, sessionId(startDay(first, 1, UUID.randomUUID())), false, false, true);
    var second = client.loginStudent(b);
    var active = sessionId(startDay(second, 1, UUID.randomUUID()));
    answerCurrent(second, active, true);
    advanceOk(second, active);
    clock.setInstant(deadline(node(session(second, active))).plusNanos(1));
    answerCurrent(second, active, true);
    var staff = client.loginStaff(teacher);
    var response = list(staff, classroom, Map.of());
    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    var sorted = node(response);
    assertThat(sorted.path("size").asInt()).isEqualTo(10);
    assertThat(sorted.path("total").asInt()).isEqualTo(150);
    assertThat(sorted.path("items").get(0).path("questionId").asInt()).isEqualTo(2);
    assertThat(sorted.path("items").get(1).path("questionId").asInt()).isEqualTo(1);
    assertThat(sorted.path("items").get(2).path("questionId").asInt()).isEqualTo(3);
    assertThat(sorted.path("items").get(3).path("questionId").asInt()).isEqualTo(4);
    assertThat(sorted.path("items").get(3).path("wrongRate").isNull()).isTrue();
    assertThat(node(list(staff, classroom, Map.of()))).isEqualTo(sorted);
    var timeout = node(list(staff, classroom, Map.of("sort", "TIMEOUT_DESC"))).path("items");
    assertThat(timeout.get(0).path("questionId").asInt()).isEqualTo(2);
    assertThat(timeout.get(1).path("questionId").asInt()).isEqualTo(1);
    var numeric = node(list(staff, classroom, Map.of("search", " 0003 ", "sort", "QUESTION_ASC")));
    assertThat(numeric.path("total").asInt()).isEqualTo(1);
    assertThat(numeric.path("items").get(0).path("questionId").asInt()).isEqualTo(3);
    assertThat(node(list(staff, classroom, Map.of("day", "30", "sort", "QUESTION_ASC"))).path("items").get(0).path("questionId").asInt()).isEqualTo(146);
    assertThat(node(list(staff, classroom, Map.of("search", content.requireQuestion("hanbit-v1", 1).getText()))).path("items").get(0).path("questionId").asInt()).isEqualTo(1);
    assertThat(node(list(staff, classroom, Map.of("search", "9".repeat(100)))).path("total").asInt()).isZero();
    var distant = node(list(staff, classroom, Map.of("page", "2147483647", "size", "50")));
    assertThat(distant.path("items")).isEmpty();
    assertThat(distant.path("total").asInt()).isEqualTo(150);
  }

  @Test
  void invalidQueryAndUnknownQuestionReturnNoPrivateData() throws Exception {
    var school = fixtures.school("잘못된 조회");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var student = fixtures.student(classroom, 1, "학생", "개인");
    var staff = client.loginStaff(teacher);
    for (var invalid : List.of(Map.of("day", "-1"), Map.of("day", "31"), Map.of("sort", "UNKNOWN"), Map.of("page", "-1"), Map.of("size", "0"), Map.of("size", "51"), Map.of("search", "😀".repeat(101)))) {
      TeacherLearningOverviewIT.SqlCapture.queries.get().clear();
      var response = list(staff, classroom, invalid);
      assertThat(response.getResponse().getStatus()).isEqualTo(400);
      assertThat(response.getResponse().getContentAsString()).doesNotContain("correctChoice", "explanation", "private", "reason");
      assertThat(TeacherLearningOverviewIT.SqlCapture.queries.get()).noneMatch(s -> s.contains("questions") || s.contains("first_answers") || s.contains("content_versions"));
    }
    for (var invalid : List.of(Map.of("day", "31"), Map.of("filter", "CORRECT"), Map.of("page", "-1"), Map.of("size", "0"), Map.of("size", "51"))) {
      var request = get(base(classroom) + "/students/" + student.getId()).session(staff);
      invalid.forEach(request::param);
      assertThat(mvc.perform(request).andReturn().getResponse().getStatus()).isEqualTo(400);
    }
    for (int invalid : List.of(0, 151)) assertThat(question(staff, classroom, invalid).getResponse().getStatus()).isEqualTo(400);
    var original = jdbc.queryForMap("select * from questions where version='hanbit-v1' and question_id=150");
    // Only isolated Testcontainers content, restored in finally even on assertion failure.
    jdbc.update("delete from questions where version='hanbit-v1' and question_id=150");
    try { assertThat(question(staff, classroom, 150).getResponse().getStatus()).isEqualTo(404); }
    finally {
      jdbc.update("insert into questions(version,question_id,day,position,text,answer,explanation,time_limit_seconds) values (?,?,?,?,?,?,?,?)", original.get("version"), original.get("question_id"), original.get("day"), original.get("position"), original.get("text"), original.get("answer"), original.get("explanation"), original.get("time_limit_seconds"));
    }
    var outsider = client.loginStaff(fixtures.teacher(fixtures.school("외부 문항 학교")));
    TeacherLearningOverviewIT.SqlCapture.queries.get().clear();
    assertThat(question(outsider, classroom, 1).getResponse().getStatus()).isEqualTo(403);
    assertThat(TeacherLearningOverviewIT.SqlCapture.queries.get()).noneMatch(s -> s.contains("questions") || s.contains("first_answers") || s.contains("content_versions"));
    assertThat(list(client.loginStudent(student), classroom, Map.of()).getResponse().getStatus()).isEqualTo(403);
  }

  private String base(Classroom classroom) { return "/api/staff/classrooms/" + classroom.getId() + "/learning"; }
  private MvcResult list(MockHttpSession staff, Classroom classroom, Map<String, String> params) throws Exception {
    var request = get(base(classroom) + "/questions").session(staff);
    params.forEach(request::param);
    return mvc.perform(request).andReturn();
  }
  private MvcResult question(MockHttpSession staff, Classroom classroom, int id) throws Exception {
    return mvc.perform(get(base(classroom) + "/questions/" + id).session(staff)).andReturn();
  }
}
