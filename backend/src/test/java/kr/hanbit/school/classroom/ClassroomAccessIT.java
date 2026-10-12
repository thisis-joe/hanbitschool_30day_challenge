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
}
