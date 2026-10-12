package kr.hanbit.school.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import java.util.*;
import java.util.concurrent.*;
import kr.hanbit.school.account.StudentRegistrationCommand;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

@TestComponent
public class RegistrationRaceHarness {
  private final MockMvc mvc;
  private final SessionTestClient client;
  private final ObjectMapper json;

  public RegistrationRaceHarness(MockMvc m, SessionTestClient c, ObjectMapper j) {
    mvc = m;
    client = c;
    json = j;
  }

  public List<Integer> submitPair(StudentRegistrationCommand a, StudentRegistrationCommand b)
      throws Exception {
    var gate = new CyclicBarrier(2);
    var pool = Executors.newFixedThreadPool(2);
    try {
      var jobs = new ArrayList<Future<Integer>>();
      for (var command : List.of(a, b)) {
        var s = new MockHttpSession();
        var csrf = client.csrf(s);
        jobs.add(
            pool.submit(
                () -> {
                  gate.await();
                  return mvc.perform(
                          post("/api/auth/students/register")
                              .session(s)
                              .header(csrf.getHeaderName(), csrf.getToken())
                              .contentType("application/json")
                              .content(json.writeValueAsString(command)))
                      .andReturn()
                      .getResponse()
                      .getStatus();
                }));
      }
      return List.of(jobs.get(0).get(30, TimeUnit.SECONDS), jobs.get(1).get(30, TimeUnit.SECONDS));
    } finally {
      pool.shutdownNow();
    }
  }
}
