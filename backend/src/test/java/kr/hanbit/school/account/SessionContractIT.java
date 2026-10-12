package kr.hanbit.school.account;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.*;
import java.util.concurrent.*;
import kr.hanbit.school.classroom.*;
import kr.hanbit.school.support.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.*;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({PostgresTestConfiguration.class, SessionTestClient.class})
class SessionContractIT {
  @Autowired MockMvc mvc;
  @Autowired TestFixtures fixtures;
  @Autowired SessionTestClient client;
  @Autowired ObjectMapper json;
  @Autowired AccountRepository accounts;
  School school;
  Classroom classroom;
  Account student;

  @BeforeEach
  void seed() {
    school = fixtures.school("테스트학교");
    var teacher = fixtures.teacher(school);
    classroom = fixtures.classroom(school, teacher, "1학년", 1);
    student = fixtures.student(classroom, 1, "김민수", "숲친구");
  }

  Map<String, Object> body(int number, String password) {
    return new HashMap<>(
        Map.of(
            "schoolId",
            school.getId(),
            "gradeLabel",
            "1학년",
            "classNumber",
            1,
            "studentNumber",
            number,
            "password",
            password));
  }

  MvcResult postJson(String path, MockHttpSession session, Map<String, ?> payload)
      throws Exception {
    var c = client.csrf(session);
    return mvc.perform(
            post(path)
                .session(session)
                .header(c.getHeaderName(), c.getToken())
                .contentType("application/json")
                .content(json.writeValueAsString(payload)))
        .andReturn();
  }

  @Test
  void anonymousMeDoesNotCreateCompetingSession() throws Exception {
    var result = mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized()).andReturn();
    assertThat(result.getRequest().getSession(false)).isNull();
  }

  @org.junit.jupiter.params.ParameterizedTest
  @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
  void whitespacePasswordChangeCanLoginAgain(boolean staff) throws Exception {
    var account = staff ? fixtures.teacher(school) : student;
    var session = staff ? client.loginStaff(account) : client.loginStudent(account);
    var changed =
        postJson(
            "/api/auth/password",
            session,
            Map.of("currentPassword", TestFixtures.PASSWORD, "newPassword", "        "));
    assertThat(changed.getResponse().getStatus()).isEqualTo(200);
    assertThat(postJson("/api/auth/logout", session, Map.of()).getResponse().getStatus())
        .isEqualTo(204);
    var payload =
        staff
            ? new HashMap<String, Object>(
                Map.of("staffLoginId", account.getStaffLoginId(), "password", "        "))
            : body(1, "        ");
    var result =
        postJson(
            staff ? "/api/auth/staff/login" : "/api/auth/students/login",
            new MockHttpSession(),
            payload);
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    assertThat(
            json.readTree(result.getResponse().getContentAsString()).path("accountId").asString())
        .isEqualTo(account.getId().toString());
  }

  @Test
  void reusingInitialPasswordDoesNotClearChangeRequirement() throws Exception {
    var teacher = fixtures.initialTeacher(school);
    var session = client.loginStaff(teacher);
    var result =
        postJson(
            "/api/auth/password",
            session,
            Map.of("currentPassword", TestFixtures.PASSWORD, "newPassword", TestFixtures.PASSWORD));
    assertThat(result.getResponse().getStatus()).isEqualTo(400);
    var stored = accounts.findById(teacher.getId()).orElseThrow();
    assertThat(stored.isMustChangePassword()).isTrue();
    assertThat(stored.getPasswordVersion()).isEqualTo(1);
    mvc.perform(get("/api/staff/classrooms").session(session))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
  }

  @Test
  void studentSessionSurvivesNextRequest() throws Exception {
    var s = client.loginStudent(student);
    mvc.perform(get("/api/auth/me").session(s))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.nickname").value("숲친구"))
        .andExpect(jsonPath("$.role").value("STUDENT"))
        .andExpect(jsonPath("$.passwordHash").doesNotExist());
  }

  @Test
  void wrongPasswordAndUnknownStudentShareError() throws Exception {
    for (var b : List.of(body(1, "Wrong!2026"), body(999, "Wrong!2026"))) {
      var result = postJson("/api/auth/students/login", new MockHttpSession(), b);
      assertThat(result.getResponse().getStatus()).isEqualTo(401);
      assertThat(json.readTree(result.getResponse().getContentAsString()).path("code").asString())
          .isEqualTo("INVALID_CREDENTIALS");
      assertThat(result.getResponse().getContentAsString()).doesNotContain("Wrong!2026");
    }
  }

  @Test
  void missingCsrfCannotLogin() throws Exception {
    mvc.perform(
            post("/api/auth/students/login")
                .contentType("application/json")
                .content(json.writeValueAsString(body(1, TestFixtures.PASSWORD))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("INVALID_CSRF_TOKEN"));
  }

  @Test
  void issuedTeacherMustChangePassword() throws Exception {
    var teacher = fixtures.initialTeacher(school);
    var s = client.loginStaff(teacher);
    mvc.perform(get("/api/auth/me").session(s))
        .andExpect(jsonPath("$.mustChangePassword").value(true));
    mvc.perform(get("/api/staff/classrooms").session(s))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
    var result =
        postJson(
            "/api/auth/password",
            s,
            Map.of("currentPassword", TestFixtures.PASSWORD, "newPassword", "Changed!2026"));
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    mvc.perform(get("/api/auth/me").session(s))
        .andExpect(jsonPath("$.mustChangePassword").value(false));
  }

  @Test
  void passwordChangeRevokesOtherSessions() throws Exception {
    var a = client.loginStudent(student);
    var b = client.loginStudent(student);
    assertThat(
            postJson(
                    "/api/auth/password",
                    a,
                    Map.of("currentPassword", TestFixtures.PASSWORD, "newPassword", "Changed!2026"))
                .getResponse()
                .getStatus())
        .isEqualTo(200);
    mvc.perform(get("/api/auth/me").session(a)).andExpect(status().isOk());
    mvc.perform(get("/api/auth/me").session(b)).andExpect(status().isUnauthorized());
  }

  @Test
  void logoutInvalidatesSession() throws Exception {
    var s = client.loginStudent(student);
    assertThat(postJson("/api/auth/logout", s, Map.of()).getResponse().getStatus()).isEqualTo(204);
    mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    assertThat(s.isInvalid()).isTrue();
  }

  @Test
  void normalizesStaffIdAndGrade() throws Exception {
    var teacher = fixtures.teacher(school);
    client.login(
        "/api/auth/staff/login",
        Map.of(
            "staffLoginId",
            " " + teacher.getStaffLoginId().toUpperCase() + " ",
            "password",
            TestFixtures.PASSWORD));
    var b = body(1, TestFixtures.PASSWORD);
    b.put("gradeLabel", " 1학년 ");
    assertThat(
            postJson("/api/auth/students/login", new MockHttpSession(), b)
                .getResponse()
                .getStatus())
        .isEqualTo(200);
  }

  @Test
  void concurrentPasswordChangeRejectsStaleVersion() throws Exception {
    var a = client.loginStudent(student);
    var b = client.loginStudent(student);
    var ca = client.csrf(a);
    var cb = client.csrf(b);
    var gate = new CyclicBarrier(2);
    var pool = Executors.newFixedThreadPool(2);
    try {
      var jobs = new ArrayList<Future<Integer>>();
      int n = 0;
      for (var session : List.of(a, b)) {
        var token = n++ == 0 ? ca : cb;
        var pass = n == 1 ? "First!2026" : "Second!2026";
        jobs.add(
            pool.submit(
                () -> {
                  gate.await();
                  return mvc.perform(
                          post("/api/auth/password")
                              .session(session)
                              .header(token.getHeaderName(), token.getToken())
                              .contentType("application/json")
                              .content(
                                  json.writeValueAsString(
                                      Map.of(
                                          "currentPassword",
                                          TestFixtures.PASSWORD,
                                          "newPassword",
                                          pass))))
                      .andReturn()
                      .getResponse()
                      .getStatus();
                }));
      }
      assertThat(List.of(jobs.get(0).get(), jobs.get(1).get())).containsExactlyInAnyOrder(200, 401);
      assertThat(accounts.findById(student.getId()).orElseThrow().getPasswordVersion())
          .isEqualTo(2);
    } finally {
      pool.shutdownNow();
    }
  }
}
