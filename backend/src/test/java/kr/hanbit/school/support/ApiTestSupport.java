package kr.hanbit.school.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import java.util.*;
import kr.hanbit.school.account.*;
import kr.hanbit.school.classroom.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.*;
import tools.jackson.databind.*;

public abstract class ApiTestSupport {
  @Autowired protected MockMvc mvc;
  @Autowired protected TestFixtures fixtures;
  @Autowired protected SessionTestClient client;
  @Autowired protected ObjectMapper json;
  @Autowired protected AccountRepository accounts;

  protected MvcResult send(String path, MockHttpSession s, Map<String, ?> data) throws Exception {
    var token = client.csrf(s);
    return mvc.perform(
            post(path)
                .session(s)
                .header(token.getHeaderName(), token.getToken())
                .contentType("application/json")
                .content(json.writeValueAsString(data)))
        .andReturn();
  }

  protected JsonNode node(MvcResult r) throws Exception {
    return json.readTree(r.getResponse().getContentAsString());
  }
}
