package kr.hanbit.school.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.hanbit.school.content.AnswerChoice;
import kr.hanbit.school.content.ContentCatalog;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

public abstract class LearningAnswerTestSupport extends LearningApiTestSupport {
  @Autowired protected ContentCatalog content;

  protected MvcResult startDay(MockHttpSession login, int day, UUID requestId) throws Exception {
    var result = send("/api/student/learning/sessions", login, startBody(day, requestId));
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    return result;
  }

  protected Map<String, Object> startBody(int day, UUID requestId) {
    return Map.of(
        "mode", "FIRST", "dayNumber", day, "requestId", requestId, "questionIds", List.of());
  }

  protected UUID sessionId(MvcResult response) throws Exception {
    return UUID.fromString(node(response).path("sessionId").asString());
  }

  protected MvcResult answer(
      MockHttpSession login, UUID sessionId, UUID requestId, int questionId, AnswerChoice choice)
      throws Exception {
    return send(
        answerPath(sessionId),
        login,
        Map.of("requestId", requestId, "questionId", questionId, "choice", choice));
  }

  protected MvcResult answerCurrent(MockHttpSession login, UUID sessionId, boolean correct)
      throws Exception {
    int questionId = node(session(login, sessionId)).path("question").path("questionId").asInt();
    var result =
        answer(login, sessionId, UUID.randomUUID(), questionId, choice(questionId, correct));
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    return result;
  }

  protected AnswerChoice choice(int questionId, boolean correct) {
    var answer = content.requireQuestion("hanbit-v1", questionId).getAnswer();
    return correct ? answer : answer == AnswerChoice.O ? AnswerChoice.X : AnswerChoice.O;
  }

  protected MvcResult advance(MockHttpSession login, UUID sessionId, UUID requestId)
      throws Exception {
    return send(advancePath(sessionId), login, Map.of("requestId", requestId));
  }

  protected MvcResult advanceOk(MockHttpSession login, UUID sessionId) throws Exception {
    var result = advance(login, sessionId, UUID.randomUUID());
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    return result;
  }

  protected MvcResult raw(MockHttpSession login, String path, String body) throws Exception {
    var token = client.csrf(login);
    return mvc.perform(
            post(path)
                .session(login)
                .header(token.getHeaderName(), token.getToken())
                .contentType("application/json")
                .content(body))
        .andReturn();
  }

  protected String answerPath(UUID id) {
    return "/api/student/learning/sessions/" + id + "/answers";
  }

  protected String advancePath(UUID id) {
    return "/api/student/learning/sessions/" + id + "/advance";
  }

  protected void assertError(MvcResult response, int status, String code) throws Exception {
    assertThat(response.getResponse().getStatus()).isEqualTo(status);
    assertThat(node(response).path("code").asString()).isEqualTo(code);
    assertThat(node(response).has("message")).isTrue();
    assertThat(node(response).has("fieldErrors")).isTrue();
  }

  protected Instant deadline(JsonNode view) {
    return Instant.parse(view.path("question").path("deadlineAt").asString());
  }

  protected List<MvcResult> complete(MockHttpSession login, UUID sessionId, boolean... correct)
      throws Exception {
    var results = new java.util.ArrayList<MvcResult>();
    for (int index = 0; index < correct.length; index++) {
      results.add(answerCurrent(login, sessionId, correct[index]));
      if (index < correct.length - 1) advanceOk(login, sessionId);
    }
    return results;
  }
}
