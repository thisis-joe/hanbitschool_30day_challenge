package kr.hanbit.school.staff.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import jakarta.persistence.EntityManager;
import org.hibernate.Session;
import org.springframework.beans.factory.annotation.Autowired;
import kr.hanbit.school.account.Account;
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
class TeacherLearningDetailIT extends LearningAnswerTestSupport {
  @Autowired EntityManager entities;

  @Test
  void dayStatesPreserveStartedRetryReplayAndPassedProgress() throws Exception {
    var school = fixtures.school("실제 회차 상태");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var student = fixtures.student(classroom, 1, "학생", "개인");
    var staff = client.loginStaff(teacher);
    var learner = client.loginStudent(student);
    var first = sessionId(startDay(learner, 1, UUID.randomUUID()));
    var response = detail(staff, classroom, student, Map.of());
    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    var started = node(response).path("days");
    assertThat(started.get(0).path("state").asString()).isEqualTo("IN_PROGRESS");
    assertThat(started.get(0).path("answered").asInt()).isZero();
    assertThat(started.get(1).path("state").asString()).isEqualTo("NOT_STARTED");
    complete(learner, first, false, false, false, false, false);
    assertThat(node(detail(staff, classroom, student, Map.of())).path("days").get(0).path("state").asString()).isEqualTo("RETRY_REQUIRED");
    var replay = sessionId(send("/api/student/learning/sessions", learner, Map.of("mode", "REPLAY", "dayNumber", 1, "requestId", UUID.randomUUID())));
    var retry = node(detail(staff, classroom, student, Map.of("day", "30", "filter", "ALL"))).path("days").get(0);
    assertThat(retry.path("state").asString()).isEqualTo("IN_PROGRESS");
    assertThat(retry.path("answered").asInt()).isEqualTo(5);
    assertThat(retry.path("correct").asInt()).isZero();
    complete(learner, replay, true, true, true, true, true);
    var passed = node(detail(staff, classroom, student, Map.of())).path("days");
    var again = sessionId(send("/api/student/learning/sessions", learner, Map.of("mode", "REPLAY", "dayNumber", 1, "requestId", UUID.randomUUID())));
    complete(learner, again, false, false, false, false, false);
    assertThat(node(detail(staff, classroom, student, Map.of())).path("days")).isEqualTo(passed);
    assertThat(passed.get(0).path("state").asString()).isEqualTo("PASSED");
  }

  @Test
  void detailUsesReadOnlyRepeatableReadSnapshotDuringLearnerWrite() throws Exception {
    var school = fixtures.school("일관된 상세");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var student = fixtures.student(classroom, 1, "학생", "개인");
    var learner = client.loginStudent(student);
    var active = sessionId(startDay(learner, 1, UUID.randomUUID()));
    var staff = client.loginStaff(teacher);
    var observed = new boolean[] {false};
    try (var executor = Executors.newSingleThreadExecutor()) {
      TeacherLearningOverviewIT.SqlCapture.beforeQuestions.set(() -> {
        entities.unwrap(Session.class).doWork(connection -> {
          assertThat(connection.isReadOnly()).isTrue();
          assertThat(connection.getTransactionIsolation()).isEqualTo(java.sql.Connection.TRANSACTION_REPEATABLE_READ);
          observed[0] = true;
        });
        try { executor.submit(() -> {
          try { answerCurrent(learner, active, true); }
          catch (Exception e) { throw new IllegalStateException(e); }
        }).get(10, TimeUnit.SECONDS); }
        catch (Exception e) { throw new IllegalStateException(e); }
      });
      var response = detail(staff, classroom, student, Map.of("filter", "ALL"));
      assertThat(response.getResponse().getStatus()).isEqualTo(200);
      assertThat(observed[0]).isTrue();
      assertThat(node(response).path("student").path("answered").asInt()).isZero();
      assertThat(node(response).path("answers").path("total").asInt()).isZero();
      assertThat(node(response).path("days").get(0).path("answered").asInt()).isZero();
    } finally { TeacherLearningOverviewIT.SqlCapture.beforeQuestions.remove(); }
    assertThat(node(detail(staff, classroom, student, Map.of("filter", "ALL"))).path("student").path("answered").asInt()).isEqualTo(1);
  }
  @Test
  void timeoutAndUnansweredHaveDifferentStates() throws Exception {
    var school = fixtures.school("상세 상태");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var student = fixtures.student(classroom, 1, "학생", "개인");
    var learner = client.loginStudent(student);
    var active = sessionId(startDay(learner, 1, UUID.randomUUID()));
    clock.setInstant(deadline(node(session(learner, active))).plusNanos(1));
    answerCurrent(learner, active, true);
    var staff = client.loginStaff(teacher);
    var response = detail(staff, classroom, student, Map.of());
    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    var wrong = node(response);
    assertThat(wrong.path("answers").path("size").asInt()).isEqualTo(8);
    assertThat(wrong.path("answers").path("total").asInt()).isEqualTo(1);
    var timeout = wrong.path("answers").path("items").get(0);
    assertThat(timeout.path("outcome").asString()).isEqualTo("TIMED_OUT");
    assertThat(timeout.path("firstChoice").isNull()).isTrue();
    assertThat(timeout.path("firstAnsweredAt").isNull()).isFalse();
    assertThat(timeout.path("correctChoice").asString()).isEqualTo("O");
    assertThat(timeout.path("position").asInt()).isEqualTo(1);
    assertThat(node(detail(staff, classroom, student, Map.of("filter", "TIMEOUT"))).path("answers")).isEqualTo(wrong.path("answers"));
    var untouched = node(detail(staff, classroom, student, Map.of("filter", "UNANSWERED"))).path("answers");
    assertThat(untouched.path("total").asInt()).isEqualTo(149);
    assertThat(untouched.path("items").get(0).path("questionId").asInt()).isEqualTo(2);
    assertThat(untouched.path("items").get(0).path("outcome").asString()).isEqualTo("UNANSWERED");
    assertThat(untouched.path("items").get(0).path("firstChoice").isNull()).isTrue();
    assertThat(untouched.path("items").get(0).path("firstAnsweredAt").isNull()).isTrue();
    assertThat(node(detail(staff, classroom, student, Map.of("filter", "ALL"))).path("answers").path("total").asInt()).isEqualTo(1);
    assertThat(wrong.path("facts").path("answered").asInt()).isEqualTo(1);
    assertThat(wrong.path("facts").path("accuracy").asDouble()).isZero();
    assertThat(wrong.path("interpretations").path("accuracy").isNull()).isTrue();
  }

  @Test
  void neighborIdsCrossFilteredPageBoundaries() throws Exception {
    var school = fixtures.school("학급 전체 이웃");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var roster = new ArrayList<Account>();
    for (int number = 1; number <= 25; number++) roster.add(fixtures.student(classroom, number, "학생" + number, "개인"));
    var staff = client.loginStaff(teacher);
    var overview = mvc.perform(get(base(classroom) + "/students").session(staff).param("search", "21").param("size", "1")).andReturn();
    assertThat(node(overview).path("students").path("items")).hasSize(1);
    var response = detail(staff, classroom, roster.get(19), Map.of());
    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    var detail = node(response);
    assertThat(detail.path("ordinal").asInt()).isEqualTo(20);
    assertThat(detail.path("totalStudents").asInt()).isEqualTo(25);
    assertThat(detail.path("previousStudentId").asString()).isEqualTo(roster.get(18).getId().toString());
    assertThat(detail.path("nextStudentId").asString()).isEqualTo(roster.get(20).getId().toString());
    assertThat(node(detail(staff, classroom, roster.get(0), Map.of())).path("previousStudentId").isNull()).isTrue();
    assertThat(node(detail(staff, classroom, roster.get(24), Map.of())).path("nextStudentId").isNull()).isTrue();
  }

  @Test
  void thirtyDaySummaryRemainsOutsideAnswerPagination() throws Exception {
    var school = fixtures.school("전체 회차");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var student = fixtures.student(classroom, 1, "학생", "개인");
    var learner = client.loginStudent(student);
    complete(learner, sessionId(startDay(learner, 1, UUID.randomUUID())), false, true, true, true, true);
    var staff = client.loginStaff(teacher);
    var response = detail(staff, classroom, student, Map.of("filter", "ALL", "size", "1"));
    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    var whole = node(response);
    var distant = node(detail(staff, classroom, student, Map.of("day", "30", "filter", "TIMEOUT", "page", "2147483647", "size", "50")));
    assertThat(whole.path("days")).hasSize(30);
    assertThat(distant.path("days")).isEqualTo(whole.path("days"));
    assertThat(distant.path("answers").path("items")).isEmpty();
    assertThat(whole.path("days").get(0).path("state").asString()).isEqualTo("PASSED");
    assertThat(whole.path("days").get(0).path("answered").asInt()).isEqualTo(5);
    assertThat(whole.path("days").get(0).path("correct").asInt()).isEqualTo(4);
    assertThat(whole.path("days").get(0).path("timedOut").asInt()).isZero();
    assertThat(whole.path("days").get(0).path("passedAt").isNull()).isFalse();
    assertThat(whole.path("days").get(29).path("dayNumber").asInt()).isEqualTo(30);
    assertThat(whole.path("facts").path("answered").asInt()).isEqualTo(3);
    assertThat(whole.path("facts").path("accuracy").asDouble()).isEqualTo(2.0 / 3);
    assertThat(whole.path("interpretations").path("answered").asInt()).isEqualTo(2);
    assertThat(whole.path("interpretations").path("accuracy").asDouble()).isEqualTo(1);
  }

  @Test
  void studentAndClassroomMustMatchSameSchool() throws Exception {
    var school = fixtures.school("상세 권한");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var student = fixtures.student(classroom, 1, "학생", "개인");
    var another = fixtures.classroom(school, teacher, "1학년", 2);
    var staff = client.loginStaff(fixtures.teacher(school));
    assertThat(detail(staff, classroom, student, Map.of()).getResponse().getStatus()).isEqualTo(200);
    var outsider = client.loginStaff(fixtures.teacher(fixtures.school("외부 학교")));
    for (var denied : List.of(outsider, client.loginStudent(student), client.loginStaff(fixtures.initialTeacher(school)))) {
      TeacherLearningOverviewIT.SqlCapture.queries.get().clear();
      assertThat(detail(denied, classroom, student, Map.of()).getResponse().getStatus()).isEqualTo(403);
      assertNoFactsLoaded();
    }
    TeacherLearningOverviewIT.SqlCapture.queries.get().clear();
    assertThat(detail(staff, another, student, Map.of()).getResponse().getStatus()).isEqualTo(403);
    assertNoFactsLoaded();
    var foreignSchool = fixtures.school("계정 불일치");
    jdbc.update("update accounts set school_id=? where id=?", foreignSchool.getId(), student.getId());
    TeacherLearningOverviewIT.SqlCapture.queries.get().clear();
    assertThat(detail(staff, classroom, student, Map.of()).getResponse().getStatus()).isEqualTo(403);
    assertNoFactsLoaded();
  }

  @Test
  void firstRecordsRemainIdenticalAfterReplayAndMastery() throws Exception {
    var school = fixtures.school("불변 상세");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var student = fixtures.student(classroom, 1, "학생", "개인별명");
    var learner = client.loginStudent(student);
    var first = sessionId(startDay(learner, 1, UUID.randomUUID()));
    answerCurrent(learner, first, false);
    advanceOk(learner, first);
    clock.setInstant(deadline(node(session(learner, first))).plusNanos(1));
    answerCurrent(learner, first, true);
    advanceOk(learner, first);
    complete(learner, first, true, true, true);
    var firstRows = jdbc.queryForList("select * from first_answers where student_account_id=? order by question_id", student.getId());
    var staff = client.loginStaff(teacher);
    var initial = detail(staff, classroom, student, Map.of());
    assertThat(initial.getResponse().getStatus()).isEqualTo(200);
    var before = node(initial);
    var reviewStart = send("/api/student/learning/sessions", learner, Map.of("mode", "REVIEW", "questionIds", List.of(1, 2), "requestId", UUID.randomUUID()));
    assertThat(reviewStart.getResponse().getStatus()).isEqualTo(200);
    complete(learner, sessionId(reviewStart), true, true);
    var replay = sessionId(send("/api/student/learning/sessions", learner, Map.of("mode", "REPLAY", "dayNumber", 1, "requestId", UUID.randomUUID())));
    complete(learner, replay, true, true, false, true, true);
    var token = client.csrf(learner);
    for (var kind : List.of("bookmarks", "review-queue"))
      assertThat(mvc.perform(put("/api/student/learning/" + kind + "/3").session(learner).header(token.getHeaderName(), token.getToken())).andReturn().getResponse().getStatus()).isEqualTo(204);
    assertThat(jdbc.queryForList("select * from first_answers where student_account_id=? order by question_id", student.getId())).isEqualTo(firstRows);
    assertThat(jdbc.queryForObject("select reason from review_queue_entries where student_account_id=? and question_id=3", String.class, student.getId())).isEqualTo("USER_AFTER_LATER_WRONG");
    var snapshot = snapshot(student);
    TeacherLearningOverviewIT.SqlCapture.queries.get().clear();
    var response = detail(staff, classroom, student, Map.of());
    var after = node(response);
    var sql = List.copyOf(TeacherLearningOverviewIT.SqlCapture.queries.get());
    assertThat(sql).allMatch(s -> s.stripLeading().startsWith("select"));
    assertThat(sql).noneMatch(s -> s.contains("private_bookmarks") || s.contains("review_queue_entries") || s.contains("last_answers") || s.contains("student_equipment") || s.contains("learning_sessions"));
    assertThat(sql).hasSizeLessThanOrEqualTo(15);
    assertThat(after.path("student").path("correct").asInt()).isEqualTo(3);
    assertThat(after.path("student").path("reviewedWrong").asInt()).isEqualTo(2);
    assertThat(after.path("student").path("pendingWrong").asInt()).isZero();
    for (int i = 0; i < 2; i++) {
      var original = before.path("answers").path("items").get(i);
      var improved = after.path("answers").path("items").get(i);
      assertThat(improved.path("outcome")).isEqualTo(original.path("outcome"));
      assertThat(improved.path("firstChoice")).isEqualTo(original.path("firstChoice"));
      assertThat(improved.path("firstAnsweredAt")).isEqualTo(original.path("firstAnsweredAt"));
      assertThat(improved.path("reviewedWrong").asBoolean()).isTrue();
    }
    assertThat(after.path("days")).isEqualTo(before.path("days"));
    for (var suffix : List.of("/questions", "/questions/1")) {
      TeacherLearningOverviewIT.SqlCapture.queries.get().clear();
      var question = mvc.perform(get(base(classroom) + suffix).session(staff)).andReturn();
      assertThat(question.getResponse().getStatus()).isEqualTo(200);
      assertThat(TeacherLearningOverviewIT.SqlCapture.queries.get()).noneMatch(s -> s.contains("private_bookmarks") || s.contains("review_queue_entries") || s.contains("last_answers") || s.contains("student_equipment"));
      assertThat(TeacherLearningOverviewIT.SqlCapture.queries.get()).allMatch(s -> s.stripLeading().startsWith("select"));
      assertThat(question.getResponse().getContentAsString()).doesNotContain("bookmarked", "reviewQueue", "reason", "password", "joinCode", "개인별명");
    }
    assertThat(snapshot(student)).isEqualTo(snapshot);
    assertThat(response.getResponse().getContentAsString()).doesNotContain("bookmarked", "reviewQueue", "reason", "lastOutcome", "password", "joinCode", "nickname", "개인별명");
  }

  private void assertNoFactsLoaded() {
    assertThat(TeacherLearningOverviewIT.SqlCapture.queries.get()).noneMatch(s -> s.contains("first_answers") || s.contains("day_progress") || s.contains("review_masteries") || s.contains("questions") || s.contains("content_versions"));
  }

  private Map<String, List<Map<String, Object>>> snapshot(Account student) {
    var result = new LinkedHashMap<String, List<Map<String, Object>>>();
    for (var table : List.of("first_answers", "last_answers", "review_attempts", "review_masteries", "review_queue_entries", "private_bookmarks", "xp_entries", "day_progress", "day_attempts", "learning_sessions", "student_appearances", "student_equipment"))
      result.put(table, jdbc.queryForList("select * from " + table + " where student_account_id=? order by 1", student.getId()));
    return result;
  }

  private String base(Classroom classroom) { return "/api/staff/classrooms/" + classroom.getId() + "/learning"; }
  private MvcResult detail(MockHttpSession login, Classroom classroom, Account student, Map<String, String> params) throws Exception {
    var request = get(base(classroom) + "/students/" + student.getId()).session(login);
    params.forEach(request::param);
    return mvc.perform(request).andReturn();
  }
}
