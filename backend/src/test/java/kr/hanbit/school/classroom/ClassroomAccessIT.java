package kr.hanbit.school.classroom;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.*;
import kr.hanbit.school.account.*;
import kr.hanbit.school.support.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.context.annotation.Import;

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({PostgresTestConfiguration.class, SessionTestClient.class})
class ClassroomAccessIT extends ApiTestSupport {
  @Autowired ClassroomRepository classes;
  @Autowired ClassroomTeacherRepository teachers;
  @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

  @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
  JoinCodeGenerator generator;

  @Test
  void createsMultipleClassesAndRejectsDuplicateTuple() throws Exception {
    var school = fixtures.school("생성학교");
    var t = fixtures.teacher(school);
    var s = client.loginStaff(t);
    for (int n : List.of(1, 2)) {
      var result =
          send(
              "/api/staff/classrooms",
              s,
              Map.of("gradeLabel", " 1학년 ", "classNumber", n, "startDate", "2026-10-12"));
      assertThat(result.getResponse().getStatus()).isEqualTo(201);
      assertThat(node(result).path("joinCode").asString())
          .matches("[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}");
      assertThat(node(result).path("canManage").asBoolean()).isTrue();
    }
    var duplicate =
        send(
            "/api/staff/classrooms",
            s,
            Map.of("gradeLabel", "1학년", "classNumber", 1, "startDate", "2026-10-12"));
    assertThat(duplicate.getResponse().getStatus()).isEqualTo(409);
    assertThat(node(duplicate).path("code").asString()).isEqualTo("CLASSROOM_ALREADY_EXISTS");
    mvc.perform(get("/api/staff/classrooms").session(s)).andExpect(jsonPath("$.length()").value(2));
  }

  @Test
  void otherSchoolRosterIsForbidden() throws Exception {
    var school = fixtures.school("명단학교");
    var t = fixtures.teacher(school);
    var other = fixtures.teacher(school);
    var c = fixtures.classroom(school, t, "2학년", 2);
    fixtures.student(c, 2, "김학생", "비밀별명");
    var st = fixtures.student(c, 1, "이학생", "비밀별명2");
    var assigned = client.loginStaff(t);
    var reader = client.loginStaff(other);
    mvc.perform(get("/api/staff/classrooms").session(assigned))
        .andExpect(jsonPath("$[0].joinCode").value(c.getJoinCode()));
    mvc.perform(get("/api/staff/classrooms").session(reader))
        .andExpect(jsonPath("$.length()").value(0));
    var list =
        mvc.perform(get("/api/staff/classrooms?scope=SCHOOL").session(reader))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].studentCount").value(2))
            .andExpect(jsonPath("$[0].canManage").value(false))
            .andReturn();
    assertThat(node(list).get(0).path("joinCode").isNull()).isTrue();
    var roster =
        mvc.perform(get("/api/staff/classrooms/" + c.getId() + "/students").session(reader))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].studentNumber").value(1))
            .andReturn();
    assertThat(roster.getResponse().getContentAsString())
        .doesNotContain("nickname", "passwordHash", "bookmark", "비밀별명");
    var outsider = fixtures.teacher(fixtures.school("다른학교"));
    for (var session : List.of(client.loginStaff(outsider), client.loginStudent(st)))
      mvc.perform(get("/api/staff/classrooms/" + c.getId() + "/students").session(session))
          .andExpect(status().isForbidden());
  }

  @Test
  void joinCodeCollisionRetriesInFreshTransaction() throws Exception {
    var school = fixtures.school("충돌학교");
    var t = fixtures.teacher(school);
    var existing = fixtures.classroom(school, t, "1", 1);
    var session = client.loginStaff(t);
    org.mockito.Mockito.doReturn(existing.getJoinCode(), "ZZZZZZZ2").when(generator).generate();
    try {
      var result =
          send(
              "/api/staff/classrooms",
              session,
              Map.of("gradeLabel", "2", "classNumber", 1, "startDate", "2026-10-12"));
      assertThat(result.getResponse().getStatus()).isEqualTo(201);
      var created =
          classes.findBySchoolIdAndGradeLabelAndClassNumber(school.getId(), "2", 1).orElseThrow();
      assertThat(created.getJoinCode()).isEqualTo("ZZZZZZZ2");
      assertThat(classes.findBySchoolIdOrderByGradeLabelAscClassNumberAsc(school.getId()))
          .hasSize(2);
      assertThat(
              teachers.findAll().stream()
                  .filter(x -> x.getId().classroomId().equals(created.getId()))
                  .count())
          .isEqualTo(1);
    } finally {
      org.mockito.Mockito.reset(generator);
    }
  }

  @Test
  void publicCatalogContainsOnlySelectorMetadata() throws Exception {
    var school = fixtures.school("공개학교");
    var c = fixtures.classroom(school, fixtures.teacher(school), "3학년", 1);
    mvc.perform(get("/api/public/schools")).andExpect(status().isOk());
    var result =
        mvc.perform(get("/api/public/schools/" + school.getId() + "/classrooms"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].gradeLabel").value("3학년"))
            .andReturn();
    assertThat(result.getResponse().getContentAsString())
        .doesNotContain("joinCode", "studentNumber", "name", c.getJoinCode());
  }

  @Test
  void teacherRosterClassroomAndPublicDtosNeverRevealPrivateQueueOrMastery() throws Exception {
    var school = fixtures.school("학습 비공개 학교");
    var teacher = fixtures.teacher(school);
    var reader = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1", 1);
    var student = fixtures.student(classroom, 1, "학생", "개인별명");
    var assigned = client.loginStaff(teacher);
    var schoolReader = client.loginStaff(reader);
    var paths =
        List.of(
            "/api/staff/classrooms",
            "/api/staff/classrooms?scope=SCHOOL",
            "/api/staff/classrooms/" + classroom.getId() + "/students");
    var before = new ArrayList<tools.jackson.databind.JsonNode>();
    for (var login : List.of(assigned, schoolReader)) {
      for (String path : paths) before.add(node(mvc.perform(get(path).session(login)).andReturn()));
    }
    var publicPath = "/api/public/schools/" + school.getId() + "/classrooms";
    var publicBefore = node(mvc.perform(get(publicPath)).andReturn());
    var session = UUID.randomUUID();
    var fact = UUID.randomUUID();
    jdbc.update(
        "insert into"
            + " learning_sessions(id,student_account_id,version,mode,day,state,current_position,deadline_at,created_at,updated_at)"
            + " values"
            + " (?,?,'hanbit-v1','REVIEW',null,'COMPLETED',1,current_timestamp,current_timestamp,current_timestamp)",
        session,
        student.getId());
    jdbc.update(
        "insert into learning_session_questions(session_id,position,version,question_id) values"
            + " (?,1,'hanbit-v1',1)",
        session);
    jdbc.update(
        "insert into"
            + " review_attempts(id,student_account_id,version,question_id,session_id,mode,request_id,choice,timed_out,correct,outcome,answered_at,response_millis)"
            + " values"
            + " (?,?,'hanbit-v1',1,?,'REVIEW',?,'O',false,true,'CORRECT',current_timestamp,0)",
        fact,
        student.getId(),
        session,
        UUID.randomUUID());
    jdbc.update(
        "insert into"
            + " review_masteries(student_account_id,version,question_id,first_correct_attempt_id,mastered_at)"
            + " values (?,'hanbit-v1',1,?,current_timestamp)",
        student.getId(),
        fact);
    jdbc.update(
        "insert into"
            + " review_queue_entries(student_account_id,version,question_id,reason,active,created_at)"
            + " values (?,'hanbit-v1',1,'USER_AFTER_LATER_WRONG',true,current_timestamp)",
        student.getId());
    jdbc.update(
        "insert into private_bookmarks(student_account_id,version,question_id,created_at)"
            + " values (?,'hanbit-v1',1,current_timestamp)",
        student.getId());
    jdbc.update(
        "insert into"
            + " last_answers(student_account_id,version,question_id,source_type,source_id,choice,timed_out,correct,outcome,answered_at)"
            + " values (?,'hanbit-v1',1,'REPEAT',?,'O',false,true,'CORRECT',current_timestamp)",
        student.getId(),
        fact);
    int index = 0;
    for (var login : List.of(assigned, schoolReader)) {
      for (String path : paths) {
        var result = mvc.perform(get(path).session(login)).andExpect(status().isOk()).andReturn();
        assertThat(node(result)).isEqualTo(before.get(index++));
        assertThat(result.getResponse().getContentAsString())
            .doesNotContain(
                "reviewQueue",
                "review_queue",
                "inReviewQueue",
                "mastery",
                "mastered",
                "review_masteries",
                "privateBookmark",
                "private_bookmarks",
                "bookmarked",
                "lastAnswer",
                "last_answers",
                "lastOutcome",
                "lastAnsweredAt",
                "reviewPromptEligible",
                "firstCorrectAttempt",
                "correctChoice",
                "explanation",
                "AUTO_FIRST_WRONG",
                "USER_AFTER_LATER_WRONG",
                fact.toString());
      }
    }
    var publicAfter = mvc.perform(get(publicPath)).andExpect(status().isOk()).andReturn();
    assertThat(node(publicAfter)).isEqualTo(publicBefore);
    assertThat(publicAfter.getResponse().getContentAsString())
        .doesNotContain(
            "reviewQueue",
            "mastery",
            "privateBookmark",
            "bookmarked",
            "lastAnswer",
            "lastOutcome",
            "reviewPromptEligible",
            "correctChoice",
            "explanation",
            fact.toString());
  }
}
