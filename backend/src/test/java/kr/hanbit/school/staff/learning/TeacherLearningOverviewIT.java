package kr.hanbit.school.staff.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import jakarta.persistence.EntityManager;
import kr.hanbit.school.account.*;
import kr.hanbit.school.classroom.Classroom;
import kr.hanbit.school.support.*;
import kr.hanbit.school.learning.DayProgressState;
import kr.hanbit.school.shared.web.ApiException;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.hibernate.Session;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password=",
    "spring.jpa.properties.hibernate.session_factory.statement_inspector=kr.hanbit.school.staff.learning.TeacherLearningOverviewIT$SqlCapture"})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({PostgresTestConfiguration.class, LearningTestClockConfiguration.class, SessionTestClient.class})
public class TeacherLearningOverviewIT extends GameApiTestSupport {
  @Autowired StaffLearningAccess access;
  @Autowired EntityManager entities;
  public static class SqlCapture implements StatementInspector {
    static final ThreadLocal<List<String>> queries = ThreadLocal.withInitial(ArrayList::new);
    static final ThreadLocal<Runnable> beforeQuestions = new ThreadLocal<>();
    public String inspect(String sql) {
      queries.get().add(sql);
      if (sql.contains(" from questions ") && beforeQuestions.get() != null) {
        var hook = beforeQuestions.get();
        beforeQuestions.remove();
        hook.run();
      }
      return sql;
    }
  }

  @Test
  void sameSchoolNonManagingTeacherCanReadButOtherSchoolCannot() throws Exception {
    var school = fixtures.school("통계 권한 학교");
    var owner = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, owner, "1학년", 1);
    fixtures.student(classroom, 1, "한빛", "개인별명");
    var otherTeacher = client.loginStaff(fixtures.teacher(school));
    assertThat(overview(otherTeacher, classroom, Map.of()).getResponse().getStatus()).isEqualTo(200);
    assertThat(overview(client.loginStaff(fixtures.admin(school)), classroom, Map.of()).getResponse().getStatus()).isEqualTo(200);
    var outsider = client.loginStaff(fixtures.teacher(fixtures.school("다른 학교")));
    SqlCapture.queries.get().clear();
    assertThat(overview(outsider, classroom, Map.of()).getResponse().getStatus()).isEqualTo(403);
    assertThat(SqlCapture.queries.get()).noneMatch(sql -> sql.contains("first_answers")
        || sql.contains("day_progress") || sql.contains("review_masteries")
        || sql.contains("questions") || sql.contains("content_versions") || sql.contains("student_profiles"));
    assertThat(mvc.perform(get(path(UUID.randomUUID())).session(otherTeacher)).andReturn()
        .getResponse().getStatus()).isEqualTo(404);
  }

  @Test
  void forcedPasswordChangeAndStudentRolesAreRejected() throws Exception {
    var school = fixtures.school("직원 제한 학교");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var student = fixtures.student(classroom, 1, "학생", "별명");
    assertError(overview(client.loginStaff(fixtures.initialTeacher(school)), classroom, Map.of()), 403, "PASSWORD_CHANGE_REQUIRED");
    assertThat(overview(client.loginStudent(student), classroom, Map.of()).getResponse().getStatus()).isEqualTo(403);
    assertThat(overview(new MockHttpSession(), classroom, Map.of()).getResponse().getStatus()).isEqualTo(401);
    var login = client.loginStaff(teacher);
    jdbc.update("update accounts set password_version=password_version+1 where id=?", teacher.getId());
    assertThat(overview(login, classroom, Map.of()).getResponse().getStatus()).isEqualTo(401);
  }

  @Test
  void filteredRowsDoNotChangeClassSummaryOrHardQuestions() throws Exception {
    var school = fixtures.school("필터 학교");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var a = fixtures.student(classroom, 1, "하나", "비공개");
    fixtures.student(classroom, 2, "둘", "비공개");
    var studentLogin = client.loginStudent(a);
    answerCurrent(studentLogin, sessionId(startDay(studentLogin, 1, UUID.randomUUID())), false);
    var login = client.loginStaff(teacher);
    var whole = node(overview(login, classroom, Map.of()));
    var filtered = node(overview(login, classroom, Map.of("search", "하나", "status", "IN_PROGRESS", "size", "1")));
    assertThat(filtered.path("students").path("items")).hasSize(1);
    assertThat(filtered.path("students").path("total").asLong()).isEqualTo(1);
    assertThat(filtered.path("summary")).isEqualTo(whole.path("summary"));
    var distant = overview(login, classroom, Map.of("page", Integer.toString(Integer.MAX_VALUE), "size", "50"));
    assertThat(distant.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(distant).path("students").path("items")).isEmpty();
    assertThat(node(distant).path("students").path("total").asLong()).isEqualTo(2);
    assertThat(whole.path("summary").path("answered").asInt()).isEqualTo(1);
    assertThat(whole.path("summary").path("unanswered").asInt()).isEqualTo(299);
  }

  @Test
  void progressSortUsesFirstAnswerCountRatherThanPassedDays() throws Exception {
    var school = fixtures.school("진행 정렬 학교");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var fewer = fixtures.student(classroom, 2, "첫 답변 하나", "개인");
    var more = fixtures.student(classroom, 1, "첫 답변 둘", "개인");
    var fewerLogin = client.loginStudent(fewer);
    answerCurrent(fewerLogin, sessionId(startDay(fewerLogin, 1, UUID.randomUUID())), true);
    // Isolated synthetic progress only: intentionally differs from actual first-answer count.
    learning.progress(fewer, 2, DayProgressState.PASSED);
    var moreLogin = client.loginStudent(more);
    var session = sessionId(startDay(moreLogin, 1, UUID.randomUUID()));
    answerCurrent(moreLogin, session, true);
    advanceOk(moreLogin, session);
    answerCurrent(moreLogin, session, true);
    var response = overview(client.loginStaff(teacher), classroom, Map.of("sort", "PROGRESS_ASC"));
    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    var rows = node(response).path("students").path("items");
    assertThat(rows.get(0).path("accountId").asString()).isEqualTo(fewer.getId().toString());
    assertThat(rows.get(0).path("answered").asInt()).isEqualTo(1);
    assertThat(rows.get(0).path("passedDayCount").asInt()).isEqualTo(1);
    assertThat(rows.get(1).path("answered").asInt()).isEqualTo(2);
    assertThat(rows.get(1).path("passedDayCount").asInt()).isZero();
  }

  @Test
  void actualFirstAnswersAndTimeoutUseIndependentCanonicalDenominators() throws Exception {
    var school = fixtures.school("첫 답변 분모 학교");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var a = fixtures.student(classroom, 1, "정답", "개인");
    var b = fixtures.student(classroom, 2, "오답", "개인");
    var c = fixtures.student(classroom, 3, "시간초과", "개인");
    var aLogin = client.loginStudent(a);
    answerCurrent(aLogin, sessionId(startDay(aLogin, 1, UUID.randomUUID())), true);
    var bLogin = client.loginStudent(b);
    var bSession = sessionId(startDay(bLogin, 1, UUID.randomUUID()));
    answerCurrent(bLogin, bSession, false);
    advanceOk(bLogin, bSession);
    answerCurrent(bLogin, bSession, false);
    var cLogin = client.loginStudent(c);
    var cSession = sessionId(startDay(cLogin, 1, UUID.randomUUID()));
    clock.setInstant(deadline(node(session(cLogin, cSession))).plusNanos(1));
    answerCurrent(cLogin, cSession, false);
    var response = overview(client.loginStaff(teacher), classroom, Map.of());
    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    var summary = node(response).path("summary");
    assertThat(summary.path("answered").asInt()).isEqualTo(4);
    assertThat(summary.path("correct").asInt()).isEqualTo(1);
    assertThat(summary.path("choiceWrong").asInt()).isEqualTo(2);
    assertThat(summary.path("timedOut").asInt()).isEqualTo(1);
    assertThat(summary.path("wrong").asInt()).isEqualTo(3);
    assertThat(summary.path("unanswered").asInt()).isEqualTo(446);
    assertThat(summary.path("accuracy").asDouble()).isEqualTo(0.25);
    assertThat(summary.path("facts").path("answered").asInt()).isEqualTo(3);
    assertThat(summary.path("facts").path("accuracy").asDouble()).isEqualTo(1.0 / 3);
    assertThat(summary.path("interpretations").path("answered").asInt()).isEqualTo(1);
    assertThat(summary.path("interpretations").path("accuracy").asDouble()).isZero();
    assertThat(summary.path("hardQuestions")).hasSize(1);
    assertThat(summary.path("hardQuestions").get(0).path("questionId").asInt()).isEqualTo(1);
    assertThat(summary.path("hardQuestions").get(0).path("wrongRate").asDouble()).isEqualTo(2.0 / 3);
    assertThat(node(overview(client.loginStaff(teacher), classroom, Map.of("status", "NEW"))).path("summary")).isEqualTo(summary);
  }

  @Test
  void studentAccessRevalidatesExactClassroomAccountRoleSchoolAndCurrentStaff() {
    var school = fixtures.school("상세 권한 학교");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var student = fixtures.student(classroom, 1, "학생", "개인");
    var another = fixtures.classroom(school, teacher, "1학년", 2);
    var principal = AuthenticationModule.principal(fixtures.teacher(school));
    assertThat(access.requireStudent(principal, classroom.getId(), student.getId()).getAccountId()).isEqualTo(student.getId());
    assertThatThrownBy(() -> access.requireStudent(principal, another.getId(), student.getId()))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(403));
    assertThatThrownBy(() -> access.requireClassroom(AuthenticationModule.principal(fixtures.initialTeacher(school)), classroom.getId()))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("PASSWORD_CHANGE_REQUIRED"));
    assertThatThrownBy(() -> access.requireClassroom(AuthenticationModule.principal(student), classroom.getId()))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(403));
    // Synthetic corrupted school association cannot widen access to an enrolled profile.
    var outsideSchool = fixtures.school("학교 불일치");
    jdbc.update("update accounts set school_id=? where id=?", outsideSchool.getId(), student.getId());
    assertThatThrownBy(() -> access.requireStudent(principal, classroom.getId(), student.getId()))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(403));
    jdbc.update("update accounts set school_id=?,role='TEACHER',staff_login_id=? where id=?",
        school.getId(), "corrupt." + UUID.randomUUID().toString().substring(0, 8), student.getId());
    assertThatThrownBy(() -> access.requireStudent(principal, classroom.getId(), student.getId()))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(403));
    var stale = fixtures.teacher(school);
    var stalePrincipal = AuthenticationModule.principal(stale);
    jdbc.update("update accounts set password_version=password_version+1 where id=?", stale.getId());
    assertThatThrownBy(() -> access.requireClassroom(stalePrincipal, classroom.getId()))
        .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(401));
  }

  @Test
  void overviewUsesActualReadOnlyRepeatableReadSnapshotDuringLearnerWrite() throws Exception {
    var school = fixtures.school("일관된 통계 학교");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var student = fixtures.student(classroom, 1, "학생", "개인");
    var learner = client.loginStudent(student);
    var active = sessionId(startDay(learner, 1, UUID.randomUUID()));
    var staff = client.loginStaff(teacher);
    var transactionObserved = new boolean[] {false};
    try (var executor = Executors.newSingleThreadExecutor()) {
      SqlCapture.beforeQuestions.set(() -> {
        entities.unwrap(Session.class).doWork(connection -> {
          assertThat(connection.isReadOnly()).isTrue();
          assertThat(connection.getTransactionIsolation()).isEqualTo(java.sql.Connection.TRANSACTION_REPEATABLE_READ);
          transactionObserved[0] = true;
        });
        try {
          executor.submit(() -> {
            try { answerCurrent(learner, active, true); }
            catch (Exception e) { throw new IllegalStateException(e); }
          }).get(10, TimeUnit.SECONDS);
        } catch (Exception e) { throw new IllegalStateException(e); }
      });
      var snapshot = overview(staff, classroom, Map.of());
      assertThat(snapshot.getResponse().getStatus()).isEqualTo(200);
      assertThat(transactionObserved[0]).isTrue();
      assertThat(node(snapshot).path("summary").path("answered").asInt()).isZero();
    } finally {
      SqlCapture.beforeQuestions.remove();
    }
    assertThat(node(overview(staff, classroom, Map.of())).path("summary").path("answered").asInt()).isEqualTo(1);
  }

  @Test
  void leadingZeroAndLongSearchRemainDeterministic() throws Exception {
    var school = fixtures.school("검색 학교");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    fixtures.student(classroom, 1, "가온", "개인");
    fixtures.student(classroom, 2, "나래", "개인");
    var login = client.loginStaff(teacher);
    var leadingZero = overview(login, classroom, Map.of("search", " 0001 "));
    assertThat(leadingZero.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(leadingZero).path("students").path("items").get(0).path("studentNumber").asInt()).isEqualTo(1);
    assertThat(node(overview(login, classroom, Map.of("search", "9".repeat(100)))).path("students").path("total").asInt()).isZero();
    assertThat(node(overview(login, classroom, Map.of("search", "가온"))).path("students").path("total").asInt()).isEqualTo(1);
    assertThat(overview(login, classroom, Map.of("search", "a".repeat(101))).getResponse().getStatus()).isEqualTo(400);
    assertThat(overview(login, classroom, Map.of("search", "😀".repeat(100))).getResponse().getStatus()).isEqualTo(200);
    assertThat(overview(login, classroom, Map.of("search", "😀".repeat(101))).getResponse().getStatus()).isEqualTo(400);
    var first = node(overview(login, classroom, Map.of("sort", "PENDING_WRONG_DESC")));
    assertThat(node(overview(login, classroom, Map.of("sort", "PENDING_WRONG_DESC")))).isEqualTo(first);
    assertThat(first.path("students").path("items").get(0).path("studentNumber").asInt()).isEqualTo(1);
    for (var invalid : List.of(Map.of("status", "UNKNOWN"), Map.of("sort", "UNKNOWN"), Map.of("page", "-1"), Map.of("size", "0"), Map.of("size", "51")))
      assertThat(overview(login, classroom, invalid).getResponse().getStatus()).isEqualTo(400);
  }

  @Test
  void reviewCorrectNeverChangesFirstAccuracy() throws Exception {
    var school = fixtures.school("복습 통계 학교");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var student = fixtures.student(classroom, 1, "학습자", "개인");
    var login = client.loginStudent(student);
    complete(login, sessionId(startDay(login, 1, UUID.randomUUID())), false, true, true, true, true);
    var staff = client.loginStaff(teacher);
    var before = node(overview(staff, classroom, Map.of())).path("summary");
    assertThat(before.path("accuracy").asDouble()).isEqualTo(0.8);
    var firstRows = jdbc.queryForList("select * from first_answers where student_account_id=? order by question_id", student.getId());
    var review = sessionId(send("/api/student/learning/sessions", login,
        Map.of("mode", "REVIEW", "questionIds", List.of(1), "requestId", UUID.randomUUID())));
    answerCurrent(login, review, true);
    var after = node(overview(staff, classroom, Map.of())).path("summary");
    assertThat(after.path("accuracy")).isEqualTo(before.path("accuracy"));
    assertThat(after.path("answered").asInt()).isEqualTo(5);
    assertThat(after.path("correct").asInt()).isEqualTo(4);
    assertThat(after.path("reviewedWrong").asInt()).isEqualTo(1);
    assertThat(after.path("pendingWrong").asInt()).isZero();
    assertThat(jdbc.queryForList("select * from first_answers where student_account_id=? order by question_id", student.getId())).isEqualTo(firstRows);
  }

  @Test
  void overviewIsReadOnlyAndExcludesPersonalState() throws Exception {
    var school = fixtures.school("읽기 전용 학교");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1);
    var student = fixtures.student(classroom, 1, "학생", "개인별명");
    var learner = client.loginStudent(student);
    complete(learner, sessionId(startDay(learner, 1, UUID.randomUUID())), false, true, true, true, true);
    var staff = client.loginStaff(teacher);
    var before = tableSnapshot(student);
    SqlCapture.queries.get().clear();
    var response = overview(staff, classroom, Map.of());
    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    var captured = List.copyOf(SqlCapture.queries.get());
    assertThat(captured).noneMatch(sql -> sql.contains("private_bookmarks") || sql.contains("review_queue_entries") || sql.contains("last_answers") || sql.contains("student_equipment"));
    assertThat(captured).allMatch(sql -> sql.stripLeading().startsWith("select"));
    assertThat(captured).hasSizeLessThanOrEqualTo(12);
    assertThat(tableSnapshot(student)).isEqualTo(before);
    assertThat(response.getResponse().getContentAsString()).doesNotContain("bookmarks", "reviewQueue", "reason", "lastOutcome", "password", "joinCode", "nickname", "equipped", "개인별명");
    assertThat(node(response).path("students").path("items").get(0).properties()).extracting(Map.Entry::getKey)
        .containsExactlyInAnyOrder("accountId", "studentNumber", "name", "characterId", "status", "answered", "correct", "wrong", "timedOut", "reviewedWrong", "pendingWrong", "passedDayCount", "accuracy");
    assertThat(node(response).path("students").path("items").get(0).path("characterId").isNull()).isTrue();
    var save = putAppearance(learner, "bora", 0, emptyEquipment());
    assertThat(save.getResponse().getStatus()).isEqualTo(200);
    var chosenSnapshot = tableSnapshot(student);
    var chosen = overview(staff, classroom, Map.of());
    assertThat(node(chosen).path("students").path("items").get(0).path("characterId").asString()).isEqualTo("bora");
    assertThat(tableSnapshot(student)).isEqualTo(chosenSnapshot);
    for (int number = 2; number <= 25; number++) fixtures.student(classroom, number, "학생" + number, "개인");
    SqlCapture.queries.get().clear();
    var larger = overview(staff, classroom, Map.of());
    assertThat(larger.getResponse().getStatus()).isEqualTo(200);
    assertThat(SqlCapture.queries.get()).hasSize(captured.size());
    assertThat(node(larger).path("summary").path("studentCount").asInt()).isEqualTo(25);
    System.out.printf("Teacher overview bounded-query evidence: 1 learner=%d SELECTs; 25 learners=%d SELECTs%n",
        captured.size(), SqlCapture.queries.get().size());
  }

  private Map<String, List<Map<String, Object>>> tableSnapshot(Account student) {
    var result = new LinkedHashMap<String, List<Map<String, Object>>>();
    for (var table : List.of("first_answers", "last_answers", "review_attempts", "review_masteries", "review_queue_entries", "private_bookmarks", "xp_entries", "day_progress", "day_attempts", "learning_sessions", "student_appearances", "student_equipment"))
      result.put(table, jdbc.queryForList("select * from " + table + " where student_account_id=? order by 1", student.getId()));
    return result;
  }

  private String path(UUID classroomId) { return "/api/staff/classrooms/" + classroomId + "/learning/students"; }
  private MvcResult overview(MockHttpSession login, Classroom classroom, Map<String, String> params) throws Exception {
    var request = get(path(classroom.getId())).session(login);
    params.forEach(request::param);
    return mvc.perform(request).andReturn();
  }
}
