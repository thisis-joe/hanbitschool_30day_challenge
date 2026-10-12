package kr.hanbit.school.account;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.*;
import kr.hanbit.school.classroom.*;
import kr.hanbit.school.support.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({PostgresTestConfiguration.class, SessionTestClient.class, RegistrationRaceHarness.class})
class StudentRegistrationIT extends ApiTestSupport {
  @Autowired ClassroomRepository classes;
  @Autowired StudentProfileRepository profiles;
  @Autowired RegistrationRaceHarness race;
  School school;
  Classroom classroom;

  @BeforeEach
  void seed() throws Exception {
    school = fixtures.school("학생가입학교");
    var teacher = fixtures.teacher(school);
    var result =
        send(
            "/api/staff/classrooms",
            client.loginStaff(teacher),
            Map.of("gradeLabel", "1학년", "classNumber", 1, "startDate", "2026-10-12"));
    assertThat(result.getResponse().getStatus()).isEqualTo(201);
    classroom = classes.findById(UUID.fromString(node(result).path("id").asString())).orElseThrow();
  }

  Map<String, Object> body(int n) {
    return new HashMap<>(
        Map.of(
            "schoolId",
            school.getId(),
            "gradeLabel",
            "1학년",
            "classNumber",
            1,
            "studentNumber",
            n,
            "name",
            "김민수",
            "nickname",
            "숲친구",
            "password",
            TestFixtures.PASSWORD,
            "classCode",
            classroom.getJoinCode()));
  }

  org.springframework.test.web.servlet.MvcResult signup(Map<String, ?> b) throws Exception {
    return send("/api/auth/students/register", new MockHttpSession(), b);
  }

  Map<String, Object> loginBody(int n) {
    return new HashMap<>(
        Map.of(
            "schoolId",
            school.getId(),
            "gradeLabel",
            "1학년",
            "classNumber",
            1,
            "studentNumber",
            n,
            "password",
            TestFixtures.PASSWORD));
  }

  @Test
  void whitespacePasswordCanLoginImmediately() throws Exception {
    var registration = body(1);
    registration.put("password", "        ");
    assertThat(signup(registration).getResponse().getStatus()).isEqualTo(201);
    var login = loginBody(1);
    login.put("password", "        ");
    var result = send("/api/auth/students/login", new MockHttpSession(), login);
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
  }

  @Test
  void signupCanLoginImmediately() throws Exception {
    var s = new MockHttpSession();
    var result = send("/api/auth/students/register", s, body(1));
    assertThat(result.getResponse().getStatus()).isEqualTo(201);
    assertThat(result.getResponse().getContentAsString())
        .doesNotContain("password", "approval", "pending");
    mvc.perform(get("/api/auth/me").session(s)).andExpect(status().isUnauthorized());
    var logged = client.login("/api/auth/students/login", loginBody(1));
    mvc.perform(get("/api/auth/me").session(logged))
        .andExpect(jsonPath("$.name").value("김민수"))
        .andExpect(jsonPath("$.nickname").value("숲친구"));
  }

  @Test
  void codeMustMatchSelectedClassroom() throws Exception {
    long before = accounts.count();
    for (var changes :
        List.of(
            Map.<String, Object>of("schoolId", fixtures.school("타학교").getId()),
            Map.<String, Object>of("gradeLabel", "2학년"),
            Map.<String, Object>of("classNumber", 2),
            Map.<String, Object>of("classCode", "XXXXXXXX"))) {
      var b = body(1);
      b.putAll(changes);
      var result = signup(b);
      assertThat(result.getResponse().getStatus()).isEqualTo(400);
      assertThat(node(result).path("code").asString()).isEqualTo("INVALID_CLASS_LINK");
    }
    assertThat(accounts.count()).isEqualTo(before);
    assertThat(profiles.countByClassroomId(classroom.getId())).isZero();
    var b = body(1);
    var resolve =
        send(
            "/api/public/classrooms/resolve",
            new MockHttpSession(),
            Map.of(
                "schoolId",
                b.get("schoolId"),
                "gradeLabel",
                b.get("gradeLabel"),
                "classNumber",
                b.get("classNumber"),
                "classCode",
                b.get("classCode")));
    assertThat(resolve.getResponse().getStatus()).isEqualTo(200);
    assertThat(resolve.getResponse().getContentAsString())
        .doesNotContain("joinCode", "name", "studentCount");
  }

  @Test
  void sameNumberRaceCreatesOneAccountAndProfile() throws Exception {
    var command =
        new StudentRegistrationCommand(
            school.getId(),
            "1학년",
            1,
            1,
            "학생",
            "별명",
            TestFixtures.PASSWORD,
            classroom.getJoinCode());
    long before = accounts.count();
    assertThat(race.submitPair(command, command)).containsExactlyInAnyOrder(201, 409);
    assertThat(accounts.count() - before).isEqualTo(1);
    assertThat(profiles.countByClassroomId(classroom.getId())).isEqualTo(1);
  }

  @Test
  void publicSignupAlwaysCreatesStudent() throws Exception {
    var b = body(1);
    b.put("role", "ADMIN");
    b.put("mustChangePassword", false);
    var result = signup(b);
    assertThat(result.getResponse().getStatus()).isEqualTo(201);
    assertThat(node(result).path("role").asString()).isEqualTo("STUDENT");
    var s = client.login("/api/auth/students/login", loginBody(1));
    mvc.perform(get("/api/admin/teachers").session(s)).andExpect(status().isForbidden());
    mvc.perform(get("/api/staff/classrooms").session(s)).andExpect(status().isForbidden());
  }

  @Test
  void unicodeNamesAndLeadingZeroNumber() throws Exception {
    var b = body(1);
    b.put("studentNumber", "01");
    b.put("name", " 김민수 ");
    b.put("nickname", "<img src=x>");
    b.put("classCode", " " + classroom.getJoinCode().toLowerCase() + " ");
    b.put("gradeLabel", " 1학년 ");
    var result = signup(b);
    assertThat(result.getResponse().getStatus()).isEqualTo(201);
    assertThat(node(result).path("name").asString()).isEqualTo("김민수");
    assertThat(node(result).path("nickname").asString()).isEqualTo("<img src=x>");
    assertThat(signup(body(1)).getResponse().getStatus()).isEqualTo(409);
    var s = client.login("/api/auth/students/login", loginBody(1));
    mvc.perform(get("/api/auth/me").session(s)).andExpect(jsonPath("$.studentNumber").value(1));
  }

  @Test
  void studentViewsOnlyOwnMe() throws Exception {
    assertThat(signup(body(1)).getResponse().getStatus()).isEqualTo(201);
    var b = body(2);
    b.put("name", "다른학생");
    assertThat(signup(b).getResponse().getStatus()).isEqualTo(201);
    var s = client.login("/api/auth/students/login", loginBody(1));
    mvc.perform(get("/api/auth/me?accountId=other").session(s))
        .andExpect(jsonPath("$.name").value("김민수"));
    var second = fixtures.classroom(school, fixtures.teacher(school), "1학년", 2);
    b = body(1);
    b.put("classNumber", 2);
    b.put("classCode", second.getJoinCode());
    b.put("password", "Second!2026");
    b.put("name", "두번째반학생");
    assertThat(signup(b).getResponse().getStatus()).isEqualTo(201);
    var login = loginBody(1);
    login.put("classNumber", 2);
    login.put("password", "Second!2026");
    var two = client.login("/api/auth/students/login", login);
    mvc.perform(get("/api/auth/me").session(two)).andExpect(jsonPath("$.name").value("두번째반학생"));
  }

  @Test
  void exactTextAndPasswordBoundaries() throws Exception {
    int n = 1;
    for (var example :
        List.of(
            new Object[] {"name", "😀".repeat(50), 201},
            new Object[] {"name", "😀".repeat(51), 400},
            new Object[] {"nickname", "😀".repeat(20), 201},
            new Object[] {"nickname", "😀".repeat(21), 400},
            new Object[] {"password", "a".repeat(8), 201},
            new Object[] {"password", "a".repeat(7), 400},
            new Object[] {"password", "가".repeat(24), 201},
            new Object[] {"password", "가".repeat(24) + "a", 400})) {
      var b = body(n++);
      b.put((String) example[0], example[1]);
      assertThat(signup(b).getResponse().getStatus())
          .as((String) example[0] + " boundary")
          .isEqualTo(example[2]);
    }
  }

  @Test
  void invalidInputsDoNotPersist() throws Exception {
    long before = accounts.count();
    for (var pair :
        List.of(
            new Object[] {"name", " "},
            new Object[] {"nickname", " "},
            new Object[] {"studentNumber", 0},
            new Object[] {"studentNumber", 1000},
            new Object[] {"studentNumber", "abc"},
            new Object[] {"schoolId", "invalid"},
            new Object[] {"classNumber", 100},
            new Object[] {"name", "bad\nname"})) {
      var b = body(1);
      b.put((String) pair[0], pair[1]);
      assertThat(signup(b).getResponse().getStatus()).isEqualTo(400);
    }
    assertThat(accounts.count()).isEqualTo(before);
  }
}
