package kr.hanbit.school.staff;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.*;
import kr.hanbit.school.account.*;
import kr.hanbit.school.support.*;
import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.context.annotation.Import;

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({PostgresTestConfiguration.class, SessionTestClient.class})
class TeacherProvisioningIT extends ApiTestSupport {
  @Test
  void adminIssuesTeacherAndSecretOnlyOnce() throws Exception {
    var school = fixtures.school("발급학교");
    var admin = fixtures.admin(school);
    var s = client.loginStaff(admin);
    var id = "teacher." + UUID.randomUUID().toString().substring(0, 8);
    var result =
        send("/api/admin/teachers", s, Map.of("name", " 김선생 ", "staffLoginId", id.toUpperCase()));
    assertThat(result.getResponse().getStatus()).isEqualTo(201);
    var data = node(result);
    var pass = data.path("initialPassword").asString();
    assertThat(pass).hasSize(32);
    var a = accounts.findByStaffLoginId(id).orElseThrow();
    assertThat(a.getRole()).isEqualTo(Role.TEACHER);
    assertThat(a.getSchoolId()).isEqualTo(school.getId());
    assertThat(a.isMustChangePassword()).isTrue();
    assertThat(a.getName()).isEqualTo("김선생");
    assertThat(a.getPasswordHash()).doesNotContain(pass);
    client.login("/api/auth/staff/login", Map.of("staffLoginId", id, "password", pass));
    var list =
        mvc.perform(get("/api/admin/teachers").session(s)).andExpect(status().isOk()).andReturn();
    assertThat(list.getResponse().getContentAsString())
        .contains(id)
        .doesNotContain("initialPassword", "passwordHash");
    assertThat(
            send("/api/admin/teachers", s, Map.of("name", "다른교사", "staffLoginId", id))
                .getResponse()
                .getStatus())
        .isEqualTo(409);
  }

  @Test
  void teacherAndStudentCannotIssue() throws Exception {
    var school = fixtures.school("권한학교");
    var t = fixtures.teacher(school);
    var c = fixtures.classroom(school, t, "1", 1);
    var st = fixtures.student(c, 1, "학생", "별명");
    for (var s : List.of(client.loginStaff(t), client.loginStudent(st)))
      assertThat(
              send(
                      "/api/admin/teachers",
                      s,
                      Map.of("name", "교사", "staffLoginId", "forbidden.teacher"))
                  .getResponse()
                  .getStatus())
          .isEqualTo(403);
  }
}
