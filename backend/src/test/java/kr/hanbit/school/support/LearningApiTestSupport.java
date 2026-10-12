package kr.hanbit.school.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

public abstract class LearningApiTestSupport extends ApiTestSupport {
  @Autowired protected LearningTestFixtures learning;
  @Autowired protected MutableClock clock;
  @Autowired protected JdbcTemplate jdbc;

  @BeforeEach
  void fixLearningTime() {
    clock.setInstant(Instant.parse("2026-10-12T00:00:00.123456789Z"));
  }

  protected MvcResult status(MockHttpSession session) throws Exception {
    return mvc.perform(get("/api/student/learning/status").session(session)).andReturn();
  }

  protected MvcResult session(MockHttpSession login, java.util.UUID sessionId) throws Exception {
    return mvc.perform(get("/api/student/learning/sessions/" + sessionId).session(login)).andReturn();
  }

  protected MvcResult startRaw(MockHttpSession session, String body) throws Exception {
    var token = client.csrf(session);
    return mvc.perform(
            post("/api/student/learning/sessions")
                .session(session)
                .header(token.getHeaderName(), token.getToken())
                .contentType("application/json")
                .content(body))
        .andReturn();
  }
}
