package kr.hanbit.school.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.Map;
import kr.hanbit.school.account.*;
import kr.hanbit.school.classroom.*;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.web.csrf.*;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

@TestComponent
public class SessionTestClient {
  private final MockMvc mvc;
  private final ObjectMapper json;
  private final StudentProfileRepository profiles;
  private final ClassroomRepository classes;

  public SessionTestClient(
      MockMvc m, ObjectMapper j, StudentProfileRepository p, ClassroomRepository c) {
    mvc = m;
    json = j;
    profiles = p;
    classes = c;
  }

  public CsrfToken csrf(MockHttpSession s) {
    try {
      var result =
          mvc.perform(get("/api/auth/csrf").session(s)).andExpect(status().isOk()).andReturn();
      var n = json.readTree(result.getResponse().getContentAsString());
      return new DefaultCsrfToken(
          n.path("headerName").asString(), "_csrf", n.path("token").asString());
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public MockHttpSession loginStaff(Account a) {
    return login(
        "/api/auth/staff/login",
        Map.of("staffLoginId", a.getStaffLoginId(), "password", TestFixtures.PASSWORD));
  }

  public MockHttpSession loginStudent(Account a) {
    var p = profiles.findById(a.getId()).orElseThrow();
    var c = classes.findById(p.getClassroomId()).orElseThrow();
    return login(
        "/api/auth/students/login",
        Map.of(
            "schoolId",
            a.getSchoolId(),
            "gradeLabel",
            c.getGradeLabel(),
            "classNumber",
            c.getClassNumber(),
            "studentNumber",
            p.getStudentNumber(),
            "password",
            TestFixtures.PASSWORD));
  }

  public MockHttpSession login(String path, Map<String, ?> body) {
    try {
      var s = new MockHttpSession();
      var token = csrf(s);
      return (MockHttpSession)
          mvc.perform(
                  post(path)
                      .session(s)
                      .header(token.getHeaderName(), token.getToken())
                      .contentType("application/json")
                      .content(json.writeValueAsString(body)))
              .andExpect(status().isOk())
              .andReturn()
              .getRequest()
              .getSession();
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
