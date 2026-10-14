package kr.hanbit.school.game;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import kr.hanbit.school.account.Account;
import kr.hanbit.school.learning.DayProgressState;
import kr.hanbit.school.support.GameApiTestSupport;
import kr.hanbit.school.support.LearningRaceHarness;
import kr.hanbit.school.support.LearningTestClockConfiguration;
import kr.hanbit.school.support.PostgresTestConfiguration;
import kr.hanbit.school.support.SessionTestClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.JsonNode;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({
  PostgresTestConfiguration.class,
  LearningTestClockConfiguration.class,
  SessionTestClient.class
})
class GameAppearanceIT extends GameApiTestSupport {
  @Autowired DataSource dataSource;
  @Autowired EntityManager entities;
  @Autowired PlatformTransactionManager transactions;

  @Test
  void emptyEquipmentRoundTripsAllSixNullKeys() throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    var read = getGame(login);
    assertThat(read.getResponse().getStatus()).isEqualTo(200);
    var initial = node(read);
    assertThat(initial.path("catalogVersion").asString()).isEqualTo("game-v1");
    assertThat(initial.path("contentVersion").asString()).isEqualTo("hanbit-v1");
    assertThat(initial.path("characterId").isNull()).isTrue();
    assertThat(initial.path("revision").asLong()).isZero();
    assertEmptyEquipment(initial);
    assertThat(initial.path("characters")).hasSize(9);
    assertThat(initial.path("items")).hasSize(30);
    assertThat(initial.path("inventory")).hasSize(30);
    for (var item : initial.path("inventory")) {
      assertThat(item.path("owned").asBoolean()).isFalse();
      assertThat(item.path("acquiredAt").isNull()).isTrue();
    }
    assertThat(learning.count("student_appearances", student)).isZero();
    assertThat(learning.count("student_equipment", student)).isZero();
    var saved = putAppearance(login, "haru", 0, emptyEquipment());
    assertThat(saved.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(saved).path("revision").asLong()).isEqualTo(1);
    assertThat(node(saved).path("characterId").asString()).isEqualTo("haru");
    assertEmptyEquipment(node(saved));
    assertThat(node(getGame(client.loginStudent(student)))).isEqualTo(node(saved));
    assertThat(learning.count("student_appearances", student)).isEqualTo(1);
    assertThat(learning.count("student_equipment", student)).isEqualTo(6);
    assertError(putAppearance(login, "naru", 0, emptyEquipment()), 409, "APPEARANCE_CONFLICT");
    assertThat(node(getGame(login))).isEqualTo(node(saved));
    var changed = putAppearance(login, "bora", 1, emptyEquipment());
    assertThat(changed.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(changed).path("revision").asLong()).isEqualTo(2);
    assertThat(node(changed).path("characterId").asString()).isEqualTo("bora");
  }

  @Test
  void ownedEquipmentCanBeSavedBeforeCharacterSelectionAndSelectionCanBeCleared() throws Exception {
    var student = student();
    learning.progress(student, 1, DayProgressState.PASSED);
    var login = client.loginStudent(student);
    var equipment = emptyEquipment();
    equipment.put("face", "face-1");
    var unselected = putAppearance(login, null, 0, equipment);
    assertThat(unselected.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(unselected).path("characterId").isNull()).isTrue();
    assertThat(node(unselected).path("equippedBySlot").path("face").asString()).isEqualTo("face-1");
    assertThat(putAppearance(login, "haru", 1, equipment).getResponse().getStatus()).isEqualTo(200);
    var cleared = putAppearance(login, null, 2, equipment);
    assertThat(cleared.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(cleared).path("characterId").isNull()).isTrue();
    assertThat(node(getGame(client.loginStudent(student)))).isEqualTo(node(cleared));
  }

  @Test
  void existingPassedFactsOwnItemsWithoutBackfill() throws Exception {
    var student = student();
    var stranger = student();
    learning.progress(student, 1, DayProgressState.PASSED);
    learning.progress(student, 2, DayProgressState.RETRY_REQUIRED);
    learning.progress(student, 3, DayProgressState.IN_PROGRESS);
    learning.progress(student, 4, DayProgressState.NOT_STARTED);
    learning.progress(stranger, 6, DayProgressState.PASSED);
    var passedAt =
        jdbc.queryForObject(
                "select passed_at from day_progress where student_account_id=? and day=1",
                Timestamp.class,
                student.getId())
            .toInstant();
    var before = learningRows(student);
    var login = client.loginStudent(student);
    var view = node(getGame(login));
    assertThat(view.path("inventory")).hasSize(30);
    assertThat(view.path("inventory").get(0).path("itemId").asString()).isEqualTo("face-1");
    assertThat(view.path("inventory").get(0).path("owned").asBoolean()).isTrue();
    assertThat(Instant.parse(view.path("inventory").get(0).path("acquiredAt").asString()))
        .isEqualTo(passedAt);
    for (int i = 1; i < 30; i++) {
      assertThat(view.path("inventory").get(i).path("owned").asBoolean()).isFalse();
      assertThat(view.path("inventory").get(i).path("acquiredAt").isNull()).isTrue();
    }
    var equipped = emptyEquipment();
    equipped.put("face", "face-1");
    var saved = putAppearance(login, "sion", 0, equipped);
    assertThat(saved.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(saved).path("equippedBySlot").path("face").asString()).isEqualTo("face-1");
    assertThat(node(saved).path("inventory")).isEqualTo(view.path("inventory"));
    assertThat(learningRows(student)).isEqualTo(before);
    assertThat(node(getGame(client.loginStudent(stranger))).path("characterId").isNull()).isTrue();
  }

  @Test
  void rejectsUnownedUnknownWrongSlotAndIncompleteEquipment() throws Exception {
    var student = student();
    learning.progress(student, 1, DayProgressState.PASSED);
    var login = client.loginStudent(student);
    var equipment = emptyEquipment();
    equipment.put("hat", "hat-1");
    assertError(putAppearance(login, "haru", 0, equipment), 409, "GAME_ITEM_NOT_OWNED");
    equipment.put("hat", "unknown");
    assertError(putAppearance(login, "haru", 0, equipment), 400, "VALIDATION_ERROR");
    equipment.put("hat", "face-1");
    assertError(putAppearance(login, "haru", 0, equipment), 400, "VALIDATION_ERROR");
    equipment = emptyEquipment();
    equipment.remove("hand");
    assertError(putAppearance(login, "haru", 0, equipment), 400, "VALIDATION_ERROR");
    equipment = emptyEquipment();
    equipment.put("extra", null);
    assertError(putAppearance(login, "haru", 0, equipment), 400, "VALIDATION_ERROR");
    equipment = emptyEquipment();
    equipment.remove("face");
    equipment.put("FACE", null);
    assertError(putAppearance(login, "haru", 0, equipment), 400, "VALIDATION_ERROR");
    assertError(putAppearance(login, "unknown", 0, emptyEquipment()), 400, "VALIDATION_ERROR");
    assertError(putAppearance(login, "haru", 0, null), 400, "VALIDATION_ERROR");
    assertError(putAppearance(login, "haru", -1, emptyEquipment()), 400, "VALIDATION_ERROR");
    var body = new LinkedHashMap<String, Object>();
    body.put("characterId", "haru");
    body.put("equippedBySlot", emptyEquipment());
    assertError(putAppearanceRaw(login, json.writeValueAsString(body)), 400, "VALIDATION_ERROR");
    body.put("expectedRevision", null);
    assertError(putAppearanceRaw(login, json.writeValueAsString(body)), 400, "VALIDATION_ERROR");
    assertThat(learning.count("student_appearances", student)).isZero();
    assertThat(learning.count("student_equipment", student)).isZero();
  }

  @Test
  void concurrentFirstSavesOnlyOneRevisionWins() throws Exception {
    var student = student();
    var left = client.loginStudent(student);
    var right = client.loginStudent(student);
    var race = new LearningRaceHarness(dataSource, jdbc, entities, transactions);
    var results =
        race.raceStudent(
            student.getId(),
            () -> putAppearance(left, "haru", 0, emptyEquipment()),
            () -> putAppearance(right, "naru", 0, emptyEquipment()));
    assertThat(results)
        .extracting(r -> r.getResponse().getStatus())
        .containsExactlyInAnyOrder(200, 409);
    for (var result : results) {
      if (result.getResponse().getStatus() == 409) assertError(result, 409, "APPEARANCE_CONFLICT");
      else assertThat(node(getGame(left))).isEqualTo(node(result));
    }
    assertThat(node(getGame(left)).path("revision").asLong()).isEqualTo(1);
    assertThat(learning.count("student_appearances", student)).isEqualTo(1);
    assertThat(learning.count("student_equipment", student)).isEqualTo(6);
  }

  @Test
  void appearanceNeverChangesLearningRowsOrDeadline() throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    var dayOne = sessionId(startDay(login, 1, UUID.randomUUID()));
    complete(login, dayOne, true, true, true, false, false);
    clock.setInstant(clock.instant().plusSeconds(1));
    var current = startDay(login, 2, UUID.randomUUID());
    var currentId = sessionId(current);
    var fixedDeadline = deadline(node(current));
    var before = learningRows(student);
    var equipment = emptyEquipment();
    equipment.put("face", "face-1");
    assertThat(getGame(login).getResponse().getStatus()).isEqualTo(200);
    assertThat(learningRows(student)).isEqualTo(before);
    var saved = putAppearance(login, "rumi", 0, equipment);
    assertThat(saved.getResponse().getStatus()).isEqualTo(200);
    assertThat(learningRows(student)).isEqualTo(before);
    assertThat(deadline(node(session(login, currentId)))).isEqualTo(fixedDeadline);
    assertError(putAppearance(login, "naru", 0, emptyEquipment()), 409, "APPEARANCE_CONFLICT");
    assertThat(learningRows(student)).isEqualTo(before);
  }

  @Test
  void studentRoleAndCsrfAreRequired() throws Exception {
    assertError(mvc.perform(get("/api/student/game")).andReturn(), 401, "UNAUTHENTICATED");
    var anonymous = new org.springframework.mock.web.MockHttpSession();
    assertError(putAppearance(anonymous, "haru", 0, emptyEquipment()), 401, "UNAUTHENTICATED");
    var school = fixtures.school("게임권한학교 " + UUID.randomUUID());
    for (var staff : List.of(fixtures.admin(school), fixtures.teacher(school))) {
      var login = client.loginStaff(staff);
      assertError(getGame(login), 403, "FORBIDDEN");
      assertError(putAppearance(login, "haru", 0, emptyEquipment()), 403, "FORBIDDEN");
    }
    var student = student();
    var login = client.loginStudent(student);
    assertError(
        mvc.perform(
                put("/api/student/game/appearance")
                    .session(login)
                    .contentType("application/json")
                    .content("{}"))
            .andReturn(),
        403,
        "INVALID_CSRF_TOKEN");
    assertThat(learning.count("student_appearances", student)).isZero();
  }

  private Account student() {
    return learning.student(LocalDate.of(2026, 10, 11));
  }

  private void assertEmptyEquipment(JsonNode view) {
    var equipment = view.path("equippedBySlot");
    assertThat(equipment.properties())
        .extracting(Map.Entry::getKey)
        .containsExactly("face", "hat", "top", "bottom", "shoes", "hand");
    for (var value : equipment) assertThat(value.isNull()).isTrue();
  }

  private Map<String, Object> learningRows(Account student) {
    var rows = new LinkedHashMap<String, Object>();
    rows.put("accounts", jdbc.queryForMap("select * from accounts where id=?", student.getId()));
    rows.put(
        "student_profiles",
        jdbc.queryForMap("select * from student_profiles where account_id=?", student.getId()));
    for (var table :
        new String[] {
          "first_answers", "xp_entries", "day_progress", "learning_sessions",
          "day_attempts", "review_attempts", "last_answers", "review_masteries", "review_queue_entries",
          "private_bookmarks", "idempotency_records"
        })
      rows.put(
          table,
          jdbc.queryForList(
              "select * from " + table + " where student_account_id=? order by row_to_json("
                  + table + ")::text",
              student.getId()));
    rows.put(
        "learning_session_questions",
        jdbc.queryForList(
            "select q.* from learning_session_questions q join learning_sessions s on s.id=q.session_id"
                + " where s.student_account_id=? order by q.session_id, q.position",
            student.getId()));
    return rows;
  }
}
