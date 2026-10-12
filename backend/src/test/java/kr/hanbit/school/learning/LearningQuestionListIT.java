package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import kr.hanbit.school.account.Account;
import kr.hanbit.school.account.AuthenticationModule;
import kr.hanbit.school.security.AccountPrincipal;
import kr.hanbit.school.shared.web.ApiException;
import kr.hanbit.school.support.LearningAnswerTestSupport;
import kr.hanbit.school.support.LearningTestClockConfiguration;
import kr.hanbit.school.support.PostgresTestConfiguration;
import kr.hanbit.school.support.SessionTestClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({
  PostgresTestConfiguration.class,
  LearningTestClockConfiguration.class,
  SessionTestClient.class
})
class LearningQuestionListIT extends LearningAnswerTestSupport {
  @Autowired DataSource dataSource;
  @Autowired PersonalLearningModule personal;

  @Test
  void bookmarksAreIndependentIdempotentAndSurviveLogoutAndAnotherDevice() throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    mutate(login, "bookmarks", 6, true, 204);
    var original =
        jdbc.queryForMap(
            "select * from private_bookmarks where student_account_id=?", student.getId());
    assertThat(original.get("created_at"))
        .isEqualTo(Timestamp.from(java.time.Instant.parse("2026-10-12T00:00:00.123456Z")));
    clock.setInstant(clock.instant().plusSeconds(1));
    mutate(login, "bookmarks", 6, true, 204);
    assertThat(
            jdbc.queryForMap(
                "select * from private_bookmarks where student_account_id=?", student.getId()))
        .isEqualTo(original);
    var bookmark = node(list(login, "BOOKMARKED")).get(0);
    assertThat(bookmark.path("questionId").asInt()).isEqualTo(6);
    assertThat(bookmark.path("inReviewQueue").asBoolean()).isFalse();
    assertThat(bookmark.path("mastered").asBoolean()).isFalse();
    assertThat(bookmark.path("bookmarked").asBoolean()).isTrue();
    assertThat(bookmark.path("lastOutcome").isNull()).isTrue();
    assertThat(bookmark.path("lastAnsweredAt").isNull()).isTrue();
    assertThat(node(list(login, "REVIEW_QUEUE"))).isEmpty();
    assertThat(node(list(login, "MASTERED"))).isEmpty();
    assertThat(learning.count("last_answers", student)).isZero();
    assertThat(learning.count("xp_entries", student)).isZero();
    var token = client.csrf(login);
    assertThat(
            mvc.perform(
                    post("/api/auth/logout")
                        .session(login)
                        .header(token.getHeaderName(), token.getToken()))
                .andReturn()
                .getResponse()
                .getStatus())
        .isEqualTo(204);
    assertThat(login.isInvalid()).isTrue();
    var otherDevice = client.loginStudent(student);
    assertThat(node(list(otherDevice, "BOOKMARKED")).get(0)).isEqualTo(bookmark);
    mutate(otherDevice, "bookmarks", 6, false, 204);
    mutate(otherDevice, "bookmarks", 6, false, 204);
    assertThat(node(list(otherDevice, "BOOKMARKED"))).isEmpty();
    assertThat(learning.count("private_bookmarks", student)).isZero();
  }

  @ParameterizedTest
  @ValueSource(strings = {"REVIEW_QUEUE", "MASTERED", "BOOKMARKED"})
  void eachFilterUsesPrincipalScopeStableOrderAndSafeLatestProjection(String filter)
      throws Exception {
    var owner = student();
    var stranger = student();
    var login = client.loginStudent(owner);
    for (int q : List.of(6, 2, 1)) {
      seedMastery(owner, q);
      seedQueue(owner, q, true);
      mutate(login, "bookmarks", q, true, 204);
    }
    seedQueue(owner, 5, false);
    seedQueue(stranger, 3, true);
    seedMastery(stranger, 4);
    mutate(client.loginStudent(stranger), "bookmarks", 5, true, 204);
    seedLast(owner, 1, "WRONG");
    seedLast(owner, 2, "TIMED_OUT");
    seedLast(owner, 6, "CORRECT");
    var result = list(login, filter);
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    var rows = node(result);
    assertThat(rows).hasSize(3);
    assertThat(rows.get(0).path("questionId").asInt()).isEqualTo(1);
    assertThat(rows.get(1).path("questionId").asInt()).isEqualTo(2);
    assertThat(rows.get(2).path("questionId").asInt()).isEqualTo(6);
    for (int i = 0; i < 3; i++) {
      var row = rows.get(i);
      assertThat(row.properties())
          .extracting(Map.Entry::getKey)
          .containsExactlyInAnyOrder(
              "questionId",
              "dayNumber",
              "position",
              "text",
              "inReviewQueue",
              "mastered",
              "bookmarked",
              "lastOutcome",
              "lastAnsweredAt");
      assertThat(row.path("inReviewQueue").asBoolean()).isTrue();
      assertThat(row.path("mastered").asBoolean()).isTrue();
      assertThat(row.path("bookmarked").asBoolean()).isTrue();
      assertThat(row.path("lastOutcome").asString())
          .isEqualTo(List.of("WRONG", "TIMED_OUT", "CORRECT").get(i));
      assertThat(row.path("lastAnsweredAt").asString()).isEqualTo("2026-10-12T00:00:00.123456Z");
    }
    assertThat(rows.get(2).path("dayNumber").asInt()).isEqualTo(2);
    assertThat(rows.get(2).path("position").asInt()).isEqualTo(1);
    assertThat(rows.get(0).path("text").asString())
        .isEqualTo(content.requireQuestion("hanbit-v1", 1).getText());
    assertThat(result.getResponse().getContentAsString())
        .doesNotContain("correctChoice", "explanation", "studentAccountId");
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void firstCorrectThenLaterWrongOrTimeoutInsertsUserAndCorrectnessNeverReleasesIt(boolean timeout)
      throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    complete(login, sessionId(startDay(login, 1, UUID.randomUUID())), true, true, true, true, true);
    var replay = replay(login);
    if (timeout) clock.setInstant(deadline(node(session(login, replay))).plusNanos(1));
    var wrong = node(answerCurrent(login, replay, false));
    assertThat(wrong.path("reviewPromptEligible").asBoolean()).isTrue();
    assertThat(learning.count("review_queue_entries", student)).isZero();
    clock.setInstant(clock.instant().plusSeconds(1));
    mutate(login, "review-queue", 1, true, 204);
    var activation = queue(student);
    assertThat(activation.get("reason")).isEqualTo("USER_AFTER_LATER_WRONG");
    assertThat(activation.get("active")).isEqualTo(true);
    assertThat(activation.get("released_at")).isNull();
    assertThat(activation.get("created_at"))
        .isEqualTo(Timestamp.from(LearningTime.persistable(clock.instant())));
    clock.setInstant(clock.instant().plusSeconds(1));
    mutate(login, "review-queue", 1, true, 204);
    assertThat(queue(student)).isEqualTo(activation);
    advanceOk(login, replay);
    complete(login, replay, true, true, true, true);
    var review = review(login, 1);
    answerCurrent(login, review, true);
    assertThat(queue(student)).isEqualTo(activation);
    mutate(login, "review-queue", 1, true, 204);
    assertThat(queue(student)).isEqualTo(activation);
    var row = node(list(client.loginStudent(student), "REVIEW_QUEUE")).get(0);
    assertThat(row.path("lastOutcome").asString()).isEqualTo("CORRECT");
    assertThat(row.path("mastered").asBoolean()).isTrue();
    assertThat(row.path("bookmarked").asBoolean()).isFalse();
  }

  @Test
  void releasedAutoPromotesToUserAndExplicitRemovalAndNewConsentReactivateIt() throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    complete(
        login, sessionId(startDay(login, 1, UUID.randomUUID())), false, true, true, true, true);
    mutate(login, "bookmarks", 1, true, 204);
    clock.setInstant(clock.instant().plusSeconds(1));
    answerCurrent(login, review(login, 1), true);
    var releasedAuto = queue(student);
    assertThat(releasedAuto.get("reason")).isEqualTo("AUTO_FIRST_WRONG");
    assertThat(releasedAuto.get("active")).isEqualTo(false);
    mutate(login, "review-queue", 1, true, 400);
    var replay = replay(login);
    answerCurrent(login, replay, false);
    clock.setInstant(clock.instant().plusSeconds(1));
    mutate(login, "review-queue", 1, true, 204);
    var user = queue(student);
    assertThat(user.get("reason")).isEqualTo("USER_AFTER_LATER_WRONG");
    assertThat(user.get("created_at")).isNotEqualTo(releasedAuto.get("created_at"));
    assertThat(user.get("released_at")).isNull();
    clock.setInstant(clock.instant().plusSeconds(1));
    mutate(login, "review-queue", 1, false, 204);
    var removed = queue(student);
    assertThat(removed.get("active")).isEqualTo(false);
    assertThat(removed.get("released_at"))
        .isEqualTo(Timestamp.from(LearningTime.persistable(clock.instant())));
    clock.setInstant(clock.instant().plusSeconds(1));
    mutate(login, "review-queue", 1, false, 204);
    assertThat(queue(student)).isEqualTo(removed);
    assertThat(node(list(login, "REVIEW_QUEUE"))).isEmpty();
    assertThat(node(list(login, "MASTERED"))).hasSize(1);
    assertThat(node(list(login, "BOOKMARKED"))).hasSize(1);
    // Eligibility is the current projection, so a removed USER can consent immediately.
    mutate(login, "review-queue", 1, true, 204);
    mutate(login, "review-queue", 1, false, 204);
    advanceOk(login, replay);
    complete(login, replay, true, true, true, true);
    clock.setInstant(clock.instant().plusSeconds(1));
    answerCurrent(login, replay(login), false);
    clock.setInstant(clock.instant().plusSeconds(1));
    mutate(login, "review-queue", 1, true, 204);
    assertThat(queue(student).get("created_at"))
        .isEqualTo(Timestamp.from(LearningTime.persistable(clock.instant())));
    assertThat(queue(student).get("released_at")).isNull();
    assertThat(queue(student).get("active")).isEqualTo(true);
    assertThat(learning.count("review_masteries", student)).isEqualTo(5);
    assertThat(learning.count("first_answers", student)).isEqualTo(5);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "unanswered",
        "first-correct",
        "first-wrong",
        "first-timeout",
        "later-wrong-without-correct"
      })
  void manualPutRejectsIneligibleCurrentStateWithoutChanges(String state) throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    if (!state.equals("unanswered")) {
      var id = sessionId(startDay(login, 1, UUID.randomUUID()));
      if (state.equals("first-timeout"))
        clock.setInstant(deadline(node(session(login, id))).plusNanos(1));
      answerCurrent(login, id, state.equals("first-correct"));
      if (state.equals("later-wrong-without-correct")) {
        advanceOk(login, id);
        complete(login, id, false, false, false, false);
        answerCurrent(login, replay(login), false);
      }
    }
    var before =
        jdbc.queryForList(
            "select * from review_queue_entries where student_account_id=?", student.getId());
    assertError(mutate(login, "review-queue", 1, true, 400), 400, "VALIDATION_ERROR");
    assertThat(
            jdbc.queryForList(
                "select * from review_queue_entries where student_account_id=?", student.getId()))
        .isEqualTo(before);
  }

  @Test
  void deletingAutoAndBookmarksDoesNotEraseLearningHistoryOrRecreateQueueOnCorrectness()
      throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    complete(
        login, sessionId(startDay(login, 1, UUID.randomUUID())), false, true, true, true, true);
    mutate(login, "review-queue", 1, false, 204);
    var removed = queue(student);
    clock.setInstant(clock.instant().plusSeconds(1));
    mutate(login, "review-queue", 1, false, 204);
    mutate(login, "review-queue", 6, false, 204);
    mutate(login, "bookmarks", 1, true, 204);
    mutate(login, "bookmarks", 1, false, 204);
    assertThat(queue(student)).isEqualTo(removed);
    answerCurrent(login, replay(login), true);
    assertThat(queue(student)).isEqualTo(removed);
    assertThat(learning.count("first_answers", student)).isEqualTo(5);
    assertThat(learning.count("review_masteries", student)).isEqualTo(1);
    assertThat(node(list(login, "REVIEW_QUEUE"))).isEmpty();
  }

  @Test
  void studentIdSpoofingCannotReadOrMutateAnotherStudentsLists() throws Exception {
    var owner = student();
    var stranger = student();
    var login = client.loginStudent(owner);
    seedQueue(owner, 1, true);
    mutate(login, "bookmarks", 1, true, 204);
    var other = client.loginStudent(stranger);
    assertThat(
            node(
                mvc.perform(
                        get("/api/student/learning/questions")
                            .session(other)
                            .param("filter", "BOOKMARKED")
                            .param("studentAccountId", owner.getId().toString()))
                    .andReturn()))
        .isEmpty();
    var token = client.csrf(other);
    var spoof =
        mvc.perform(
                put("/api/student/learning/bookmarks/2")
                    .session(other)
                    .header(token.getHeaderName(), token.getToken())
                    .contentType("application/json")
                    .content(json.writeValueAsString(Map.of("studentAccountId", owner.getId()))))
            .andReturn();
    assertThat(spoof.getResponse().getStatus()).isEqualTo(204);
    mutate(other, "review-queue", 1, false, 204);
    assertThat(queue(owner).get("active")).isEqualTo(true);
    assertThat(node(list(login, "BOOKMARKED")).get(0).path("questionId").asInt()).isEqualTo(1);
    assertThat(node(list(other, "BOOKMARKED")).get(0).path("questionId").asInt()).isEqualTo(2);
  }

  @ParameterizedTest
  @ValueSource(strings = {"bookmarks", "review-queue"})
  void unknownOrNonactiveVersionQuestionIsNotFoundForEveryMutation(String kind) throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    mutate(login, kind, 151, true, 404);
    mutate(login, kind, 151, false, 404);
    mutate(login, "bookmarks", 1, true, 204);
    seedQueue(student, 1, true);
    seedMastery(student, 1);
    // A question may exist in an inactive version but be absent from the active one.
    jdbc.update(
        "insert into content_versions(version,digest,active,created_at) values"
            + " ('task8-empty-active',?,false,?)",
        "a".repeat(64),
        Timestamp.from(clock.instant()));
    try {
      jdbc.update("update content_versions set active=false where version='hanbit-v1'");
      jdbc.update("update content_versions set active=true where version='task8-empty-active'");
      mutate(login, kind, 1, true, 404);
      mutate(login, kind, 1, false, 404);
      for (String filter : List.of("REVIEW_QUEUE", "MASTERED", "BOOKMARKED"))
        assertThat(node(list(login, filter))).isEmpty();
    } finally {
      jdbc.update("update content_versions set active=false where version='task8-empty-active'");
      jdbc.update("update content_versions set active=true where version='hanbit-v1'");
      jdbc.update("delete from content_versions where version='task8-empty-active'");
    }
  }

  @Test
  void authenticationRoleCsrfAndFilterValidationProtectEveryPrivateRoute() throws Exception {
    var staff = client.loginStaff(fixtures.teacher(fixtures.school("목록 권한 학교")));
    var login = client.loginStudent(student());
    for (var bad : List.of(new MockHttpSession(), staff)) {
      int expected = bad == staff ? 403 : 401;
      assertThat(list(bad, "BOOKMARKED").getResponse().getStatus()).isEqualTo(expected);
      for (String kind : List.of("bookmarks", "review-queue")) {
        mutate(bad, kind, 1, true, expected);
        mutate(bad, kind, 1, false, expected);
      }
    }
    for (String kind : List.of("bookmarks", "review-queue")) {
      assertThat(
              mvc.perform(put("/api/student/learning/" + kind + "/1").session(login))
                  .andReturn()
                  .getResponse()
                  .getStatus())
          .isEqualTo(403);
      assertThat(
              mvc.perform(delete("/api/student/learning/" + kind + "/1").session(login))
                  .andReturn()
                  .getResponse()
                  .getStatus())
          .isEqualTo(403);
    }
    assertError(list(login, "OTHER"), 400, "VALIDATION_ERROR");
    assertThat(
            mvc.perform(get("/api/student/learning/questions").session(login))
                .andReturn()
                .getResponse()
                .getStatus())
        .isEqualTo(400);
  }

  @Test
  void missingFilterUsesTheStandardValidationErrorContract() throws Exception {
    var login = client.loginStudent(student());
    var result = mvc.perform(get("/api/student/learning/questions").session(login)).andReturn();
    assertThat(result.getResponse().getStatus()).isEqualTo(400);
    assertThat(result.getResponse().getContentAsString()).isNotEmpty();
    assertError(result, 400, "VALIDATION_ERROR");
    assertThat(node(result).path("fieldErrors").has("filter")).isTrue();
  }

  @Test
  void manualPutLocksAndRevalidatesLatestStateAfterConcurrentAnswerUpdate() throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    complete(login, sessionId(startDay(login, 1, UUID.randomUUID())), true, true, true, true, true);
    answerCurrent(login, replay(login), false);
    try (var executor = Executors.newSingleThreadExecutor();
        var connection = dataSource.getConnection()) {
      connection.setAutoCommit(false);
      try (var update =
          connection.prepareStatement(
              "update last_answers set correct=true,outcome='CORRECT' where student_account_id=?"
                  + " and question_id=1")) {
        update.setObject(1, student.getId());
        update.executeUpdate();
      }
      var future = executor.submit(() -> mutate(login, "review-queue", 1, true, 400));
      await().atMost(Duration.ofSeconds(5)).until(() -> waitingOn("last_answers"));
      connection.commit();
      assertError(future.get(5, TimeUnit.SECONDS), 400, "VALIDATION_ERROR");
    }
    assertThat(learning.count("review_queue_entries", student)).isZero();
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void concurrentCorrectFinalizerAndManualMutationUseTheSameLockOrder(boolean add)
      throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    var otherDevice = client.loginStudent(student);
    complete(
        login, sessionId(startDay(login, 1, UUID.randomUUID())), false, true, true, true, true);
    var review = review(login, 1);
    try (var executor = Executors.newFixedThreadPool(2);
        var connection = dataSource.getConnection()) {
      connection.setAutoCommit(false);
      try (var lock =
          connection.prepareStatement(
              "select question_id from review_queue_entries where student_account_id=? and"
                  + " question_id=1 for update")) {
        lock.setObject(1, student.getId());
        lock.executeQuery().close();
      }
      var correctness = executor.submit(() -> answerCurrent(login, review, true));
      await().atMost(Duration.ofSeconds(5)).until(() -> waitingOn("review_queue_entries"));
      var mutation =
          executor.submit(() -> mutate(otherDevice, "review-queue", 1, add, add ? 400 : 204));
      await().atMost(Duration.ofSeconds(5)).until(() -> waitingOn("last_answers"));
      connection.commit();
      assertThat(node(correctness.get(5, TimeUnit.SECONDS)).path("outcome").asString())
          .isEqualTo("CORRECT");
      mutation.get(5, TimeUnit.SECONDS);
    }
    assertThat(queue(student).get("reason")).isEqualTo("AUTO_FIRST_WRONG");
    assertThat(queue(student).get("active")).isEqualTo(false);
    assertThat(queue(student).get("released_at"))
        .isEqualTo(Timestamp.from(LearningTime.persistable(clock.instant())));
    assertThat(learning.count("review_masteries", student)).isEqualTo(1);
    assertThat(node(list(login, "REVIEW_QUEUE"))).isEmpty();
  }

  @ParameterizedTest
  @ValueSource(strings = {"bookmarks", "review-queue"})
  void concurrentPutDeleteSerializeAbsentKeysAndPreserveLastTransition(String kind)
      throws Exception {
    var student = student();
    var firstLogin = client.loginStudent(student);
    var secondLogin = client.loginStudent(student);
    if (kind.equals("review-queue")) {
      complete(
          firstLogin,
          sessionId(startDay(firstLogin, 1, UUID.randomUUID())),
          true,
          true,
          true,
          true,
          true);
      answerCurrent(firstLogin, replay(firstLogin), false);
    }
    // Gate the existing profile key so both requests race on an absent private row.
    try (var executor = Executors.newFixedThreadPool(2);
        var connection = dataSource.getConnection()) {
      connection.setAutoCommit(false);
      try (var lock =
          connection.prepareStatement(
              "select account_id from student_profiles where account_id=? for update")) {
        lock.setObject(1, student.getId());
        lock.executeQuery().close();
      }
      var put = executor.submit(() -> mutate(firstLogin, kind, 1, true, 204));
      await().atMost(Duration.ofSeconds(5)).until(() -> waitingOn("student_profiles"));
      var duplicate = executor.submit(() -> mutate(secondLogin, kind, 1, true, 204));
      connection.commit();
      put.get(5, TimeUnit.SECONDS);
      duplicate.get(5, TimeUnit.SECONDS);
    }
    String table = kind.equals("bookmarks") ? "private_bookmarks" : "review_queue_entries";
    assertThat(learning.count(table, student)).isEqualTo(1);
    try (var executor = Executors.newFixedThreadPool(2);
        var connection = dataSource.getConnection()) {
      connection.setAutoCommit(false);
      try (var lock =
          connection.prepareStatement(
              "select question_id from " + table + " where student_account_id=? for update")) {
        lock.setObject(1, student.getId());
        lock.executeQuery().close();
      }
      var deletion = executor.submit(() -> mutate(firstLogin, kind, 1, false, 204));
      await().atMost(Duration.ofSeconds(5)).until(() -> waitingOn(table));
      var insertion = executor.submit(() -> mutate(secondLogin, kind, 1, true, 204));
      await().atMost(Duration.ofSeconds(5)).until(() -> waitingOn("student_profiles"));
      connection.commit();
      deletion.get(5, TimeUnit.SECONDS);
      insertion.get(5, TimeUnit.SECONDS);
    }
    assertThat(learning.count(table, student)).isEqualTo(1);
    if (kind.equals("review-queue")) assertThat(queue(student).get("active")).isEqualTo(true);
  }

  @Test
  void teacherAndPublicResponsesStayIdenticalAfterPrivateApiMutations() throws Exception {
    var school = fixtures.school("목록 비공개 학교");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1", 1);
    var student = fixtures.student(classroom, 1, "학생", "별빛");
    var staff = client.loginStaff(teacher);
    var paths =
        List.of(
            "/api/staff/classrooms",
            "/api/staff/classrooms/" + classroom.getId() + "/students",
            "/api/public/schools/" + school.getId() + "/classrooms");
    var before = new java.util.ArrayList<tools.jackson.databind.JsonNode>();
    for (String path : paths) before.add(node(mvc.perform(get(path).session(staff)).andReturn()));
    seedMastery(student, 1);
    seedLast(student, 1, "WRONG");
    var login = client.loginStudent(student);
    mutate(login, "bookmarks", 1, true, 204);
    mutate(login, "review-queue", 1, true, 204);
    for (int i = 0; i < paths.size(); i++) {
      var result = mvc.perform(get(paths.get(i)).session(staff)).andReturn();
      assertThat(node(result)).isEqualTo(before.get(i));
      assertThat(result.getResponse().getContentAsString())
          .doesNotContain(
              "bookmarked", "reviewQueue", "mastered", "lastOutcome", "USER_AFTER_LATER_WRONG");
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"list", "put-queue", "delete-queue", "put-bookmark", "delete-bookmark"})
  void moduleRejectsMissingPrincipalStaffAndBrokenStudentContextBeforePrivateWrites(
      String operation) {
    var teacher = fixtures.teacher(fixtures.school("개인 모듈 권한"));
    assertThatThrownBy(() -> privateOperation(operation, AuthenticationModule.principal(teacher)))
        .isInstanceOfSatisfying(
            ApiException.class, error -> assertThat(error.status()).isEqualTo(403));
    assertThatThrownBy(() -> privateOperation(operation, null))
        .isInstanceOfSatisfying(
            ApiException.class, error -> assertThat(error.status()).isEqualTo(401));
    var student = student();
    jdbc.update("delete from student_profiles where account_id=?", student.getId());
    assertThatThrownBy(() -> privateOperation(operation, AuthenticationModule.principal(student)))
        .isInstanceOfSatisfying(
            ApiException.class, error -> assertThat(error.status()).isEqualTo(401));
    assertThat(learning.count("private_bookmarks", student)).isZero();
    assertThat(learning.count("review_queue_entries", student)).isZero();
  }

  private void privateOperation(String operation, AccountPrincipal principal) {
    switch (operation) {
      case "list" -> personal.list(principal, PersonalQuestionFilter.BOOKMARKED);
      case "put-queue" -> personal.addReviewQueue(principal, 1);
      case "delete-queue" -> personal.removeReviewQueue(principal, 1);
      case "put-bookmark" -> personal.addBookmark(principal, 1);
      case "delete-bookmark" -> personal.removeBookmark(principal, 1);
      default -> throw new IllegalArgumentException(operation);
    }
  }

  private boolean waitingOn(String table) {
    return jdbc.queryForObject(
            "select count(*) from pg_stat_activity where wait_event_type='Lock' and query like ?",
            Integer.class,
            "%" + table + "%")
        > 0;
  }

  private Account student() {
    return learning.student(LocalDate.of(2026, 10, 12));
  }

  private MvcResult list(MockHttpSession login, String filter) throws Exception {
    return mvc.perform(
            get("/api/student/learning/questions").session(login).param("filter", filter))
        .andReturn();
  }

  private MvcResult mutate(
      MockHttpSession login, String kind, int question, boolean add, int expected)
      throws Exception {
    var token = client.csrf(login);
    String path = "/api/student/learning/" + kind + "/" + question;
    var result =
        mvc.perform(
                (add ? put(path) : delete(path))
                    .session(login)
                    .header(token.getHeaderName(), token.getToken()))
            .andReturn();
    assertThat(result.getResponse().getStatus()).isEqualTo(expected);
    if (expected == 204) assertThat(result.getResponse().getContentAsString()).isEmpty();
    return result;
  }

  private UUID replay(MockHttpSession login) throws Exception {
    var result =
        send(
            "/api/student/learning/sessions",
            login,
            Map.of(
                "mode",
                "REPLAY",
                "dayNumber",
                1,
                "questionIds",
                List.of(),
                "requestId",
                UUID.randomUUID()));
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    return sessionId(result);
  }

  private UUID review(MockHttpSession login, int question) throws Exception {
    var result =
        send(
            "/api/student/learning/sessions",
            login,
            Map.of(
                "mode",
                "REVIEW",
                "questionIds",
                List.of(question),
                "requestId",
                UUID.randomUUID()));
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    return sessionId(result);
  }

  private Map<String, Object> queue(Account student) {
    return jdbc.queryForMap(
        "select * from review_queue_entries where student_account_id=? and question_id=1",
        student.getId());
  }

  private void seedQueue(Account student, int question, boolean active) {
    jdbc.update(
        "insert into"
            + " review_queue_entries(student_account_id,version,question_id,reason,active,created_at,released_at)"
            + " values (?,'hanbit-v1',?,'AUTO_FIRST_WRONG',?,?,?)",
        student.getId(),
        question,
        active,
        Timestamp.from(clock.instant()),
        active ? null : Timestamp.from(clock.instant()));
  }

  private void seedLast(Account student, int question, String outcome) {
    boolean timeout = outcome.equals("TIMED_OUT");
    jdbc.update(
        "insert into"
            + " last_answers(student_account_id,version,question_id,source_type,source_id,choice,timed_out,correct,outcome,answered_at)"
            + " values (?,'hanbit-v1',?,'REPEAT',?,?,?,?,?,?)",
        student.getId(),
        question,
        UUID.randomUUID(),
        timeout ? null : "O",
        timeout,
        outcome.equals("CORRECT"),
        outcome,
        Timestamp.from(LearningTime.persistable(clock.instant())));
  }

  private void seedMastery(Account student, int question) {
    var session = UUID.randomUUID();
    var source = UUID.randomUUID();
    var now = Timestamp.from(LearningTime.persistable(clock.instant()));
    jdbc.update(
        "insert into"
            + " learning_sessions(id,student_account_id,version,mode,day,state,current_position,deadline_at,created_at,updated_at)"
            + " values (?,?,'hanbit-v1','REVIEW',null,'COMPLETED',1,?,?,?)",
        session,
        student.getId(),
        now,
        now,
        now);
    jdbc.update(
        "insert into learning_session_questions(session_id,position,version,question_id) values"
            + " (?,1,'hanbit-v1',?)",
        session,
        question);
    jdbc.update(
        "insert into"
            + " review_attempts(id,student_account_id,version,question_id,session_id,mode,request_id,choice,timed_out,correct,outcome,answered_at,response_millis)"
            + " values (?,?,'hanbit-v1',?,?,'REVIEW',?,'O',false,true,'CORRECT',?,0)",
        source,
        student.getId(),
        question,
        session,
        UUID.randomUUID(),
        now);
    jdbc.update(
        "insert into"
            + " review_masteries(student_account_id,version,question_id,first_correct_attempt_id,mastered_at)"
            + " values (?,'hanbit-v1',?,?,?)",
        student.getId(),
        question,
        source,
        now);
  }
}
