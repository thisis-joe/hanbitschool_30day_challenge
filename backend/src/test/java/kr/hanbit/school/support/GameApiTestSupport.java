package kr.hanbit.school.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

public abstract class GameApiTestSupport extends LearningAnswerTestSupport {
  protected MvcResult getGame(MockHttpSession login) throws Exception {
    return mvc.perform(get("/api/student/game").session(login)).andReturn();
  }

  protected MvcResult putAppearance(
      MockHttpSession login, String characterId, long revision, Map<String, String> equipment)
      throws Exception {
    var body = new LinkedHashMap<String, Object>();
    body.put("characterId", characterId);
    body.put("expectedRevision", revision);
    body.put("equippedBySlot", equipment);
    return putAppearanceRaw(login, json.writeValueAsString(body));
  }

  protected MvcResult putAppearanceRaw(MockHttpSession login, String body) throws Exception {
    var token = client.csrf(login);
    return mvc.perform(
            put("/api/student/game/appearance")
                .session(login)
                .header(token.getHeaderName(), token.getToken())
                .contentType("application/json")
                .content(body))
        .andReturn();
  }

  protected Map<String, String> emptyEquipment() {
    var result = new LinkedHashMap<String, String>();
    for (var slot : new String[] {"face", "hat", "top", "bottom", "shoes", "hand"})
      result.put(slot, null);
    return result;
  }
}
