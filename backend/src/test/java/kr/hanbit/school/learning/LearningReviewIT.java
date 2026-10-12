package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.hanbit.school.account.Account;
import kr.hanbit.school.account.AuthenticationModule;
import kr.hanbit.school.learning.xp.XpEntryRepository;
import kr.hanbit.school.support.LearningAnswerTestSupport;
import kr.hanbit.school.support.LearningTestClockConfiguration;
import kr.hanbit.school.support.PostgresTestConfiguration;
import kr.hanbit.school.support.SessionTestClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({
  PostgresTestConfiguration.class,
  LearningTestClockConfiguration.class,
  SessionTestClient.class
})
class LearningReviewIT extends LearningAnswerTestSupport {
  @Autowired DayAttemptRepository attempts;
  @Autowired LearningSessionModule sessionModule;
  @Autowired LearningAnswerModule answers;
  @Autowired LearningAnswerFinalizer finalizer;
  @Autowired XpEntryRepository xp;
  @Autowired PlatformTransactionManager transactions;

  @Test
  void firstWrongAndTimeoutActivateAutoWhileFirstCorrectDoesNot() throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var wrong = node(answerCurrent(login, id, false));
    assertThat(wrong.path("reviewPromptEligible").asBoolean()).isFalse();
    assertAuto(student, 1, true, null);
    advanceOk(login, id);
    var deadline = deadline(node(session(login, id)));
    clock.setInstant(deadline.plusNanos(1));
    var timeout = node(answerCurrent(login, id, true));
    assertThat(timeout.path("outcome").asString()).isEqualTo("TIMED_OUT");
    assertAuto(student, 2, true, null);
    advanceOk(login, id);
    answerCurrent(login, id, true);
    assertThat(queueCount(student, 3)).isZero();
    assertThat(learning.count("review_masteries", student)).isZero();
    var row = queue(student, 2);
    assertThat(row.get("created_at"))
        .isEqualTo(Timestamp.from(LearningTime.persistable(clock.instant())));
  }

  @Test
  void reviewPersistsChosenOrderAndResumesOnAnotherLoginWithoutDayAttempts() throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    firstWrongDay(login);
    var daysBefore =
        jdbc.queryForList("select * from day_progress where student_account_id=?", student.getId());
    var request = UUID.randomUUID();
    var started = review(login, List.of(5, 2, 4), request);
    var id = sessionId(started);
    var view = node(started);
    assertThat(view.path("mode").asString()).isEqualTo("REVIEW");
    assertThat(view.path("dayNumber").isNull()).isTrue();
    assertThat(view.path("questionCount").asInt()).isEqualTo(3);
    assertThat(view.path("question").path("questionId").asInt()).isEqualTo(5);
    assertThat(view.path("answeredCount").asInt()).isZero();
    assertThat(attempts.findBySessionId(id)).isEmpty();
    assertThat(
            jdbc.queryForList(
                "select question_id from learning_session_questions where session_id=? order by"
                    + " position",
                Integer.class,
                id))
        .containsExactly(5, 2, 4);
    assertThat(node(review(client.loginStudent(student), List.of(5, 2, 4), UUID.randomUUID())))
        .isEqualTo(view);
    assertThat(node(session(client.loginStudent(student), id))).isEqualTo(view);
    var first = node(answerCurrent(login, id, true));
    assertReviewResult(first, 1, 1);
    assertThat(node(session(client.loginStudent(student), id)).path("lastAnswer")).isEqualTo(first);
    assertThat(node(session(client.loginStudent(student), id)).path("answeredCount").asInt())
        .isEqualTo(1);
    // The selected target stays resumable even after correctness released its first AUTO row.
    assertThat(sessionId(review(login, List.of(5, 2, 4), UUID.randomUUID()))).isEqualTo(id);
    var second = node(advanceOk(login, id));
    assertThat(second.path("question").path("questionId").asInt()).isEqualTo(2);
    assertThat(second.path("lastAnswer").isNull()).isTrue();
    assertThat(second.toString()).doesNotContain("correctChoice", "explanation");
    var result2 = node(answerCurrent(login, id, false));
    assertReviewResult(result2, 2, 1);
    var third = node(advanceOk(login, id));
    assertThat(third.path("question").path("questionId").asInt()).isEqualTo(4);
    var result3 = node(answerCurrent(login, id, true));
    assertReviewResult(result3, 3, 2);
    var completed = node(session(client.loginStudent(student), id));
    assertThat(completed.path("state").asString()).isEqualTo("COMPLETED");
    assertThat(completed.path("answeredCount").asInt()).isEqualTo(3);
    assertThat(completed.path("lastAnswer")).isEqualTo(result3);
    assertThat(node(advanceOk(login, id))).isEqualTo(completed);
    assertThat(
            jdbc.queryForList(
                "select * from day_progress where student_account_id=?", student.getId()))
        .isEqualTo(daysBefore);
    assertThat(
            node(
                send(
                    "/api/student/learning/sessions",
                    login,
                    reviewBody(List.of(5, 2, 4), request))))
        .isEqualTo(view);
  }

  @Test
  void reviewUsesOneXpAndImmutableFirstFactsAndFirstCorrectMastery() throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    firstWrongDay(login);
    var original =
        jdbc.queryForList(
            "select * from first_answers where student_account_id=? order by question_id",
            student.getId());
    var beforeXp = xp.sumAmountByStudentAccountId(student.getId());
    var id = sessionId(review(login, List.of(3, 1), UUID.randomUUID()));
    var wrong = node(answerCurrent(login, id, false));
    assertThat(learning.count("review_masteries", student)).isZero();
    assertAuto(student, 3, true, null);
    advanceOk(login, id);
    var correct = node(answerCurrent(login, id, true));
    var fact = UUID.fromString(correct.path("attemptAnswerId").asString());
    var mastery = mastery(student, 1);
    assertThat(mastery.get("first_correct_attempt_id")).isEqualTo(fact);
    assertThat(mastery.get("mastered_at"))
        .isEqualTo(Timestamp.from(LearningTime.persistable(clock.instant())));
    assertAuto(student, 1, false, (Timestamp) mastery.get("mastered_at"));
    assertThat(correct.path("reviewPromptEligible").asBoolean()).isFalse();
    assertThat(xp.sumAmountByStudentAccountId(student.getId())).isEqualTo(beforeXp + 2);
    assertThat(
            jdbc.queryForList(
                "select amount from xp_entries where student_account_id=? and kind='REPEAT_ANSWER'",
                Integer.class,
                student.getId()))
        .containsExactly(1, 1);
    assertThat(
            jdbc.queryForList(
                "select * from first_answers where student_account_id=? order by question_id",
                student.getId()))
        .isEqualTo(original);
    assertThat(
            jdbc.queryForObject(
                "select mode='REVIEW' and day_attempt_id is null from review_attempts where id=?",
                Boolean.class,
                fact))
        .isTrue();
    assertThat(
            jdbc.queryForObject(
                "select source_type='REPEAT' and source_id=? and outcome='CORRECT' from"
                    + " last_answers where student_account_id=? and question_id=1",
                Boolean.class,
                fact,
                student.getId()))
        .isTrue();
    assertThat(wrong.path("reviewPromptEligible").asBoolean()).isFalse();
  }

  @ParameterizedTest
  @ValueSource(booleans = {true, false})
  void replayCreatesMasteryOnceAndLaterWrongOrTimeoutPromptsWithoutEnqueuing(boolean timeout)
      throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    firstWrongDay(login);
    var firstReplay = sessionId(replay(login));
    var correct = node(answerCurrent(login, firstReplay, true));
    var original = mastery(student, 1);
    assertThat(original.get("first_correct_attempt_id"))
        .isEqualTo(UUID.fromString(correct.path("attemptAnswerId").asString()));
    assertAuto(student, 1, false, (Timestamp) original.get("mastered_at"));
    advanceOk(login, firstReplay);
    complete(login, firstReplay, true, true, true, true);
    var later = sessionId(replay(login));
    if (timeout) clock.setInstant(deadline(node(session(login, later))).plusNanos(1));
    var wrong = node(answerCurrent(login, later, !timeout ? false : true));
    assertThat(wrong.path("outcome").asString()).isEqualTo(timeout ? "TIMED_OUT" : "WRONG");
    assertThat(wrong.path("reviewPromptEligible").asBoolean()).isTrue();
    assertThat(mastery(student, 1)).isEqualTo(original);
    assertAuto(student, 1, false, (Timestamp) original.get("mastered_at"));
    advanceOk(login, later);
    complete(login, later, true, true, true, true);
    var third = sessionId(replay(login));
    answerCurrent(login, third, true);
    assertThat(mastery(student, 1)).isEqualTo(original);
  }

  @ParameterizedTest
  @CsvSource({"true,false", "false,false", "true,true", "false,true"})
  void priorCorrectFirstPromptsOnlyOnLaterWrongAndNeverCreatesAUserRow(
      boolean timeout, boolean inactiveUser) throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    complete(login, sessionId(startDay(login, 1, UUID.randomUUID())), true, true, true, true, true);
    if (inactiveUser) seedQueue(student, 1, "USER_AFTER_LATER_WRONG", false);
    var id = sessionId(replay(login));
    if (timeout) clock.setInstant(deadline(node(session(login, id))).plusNanos(1));
    var result = node(answerCurrent(login, id, !timeout ? false : true));
    assertThat(result.path("reviewPromptEligible").asBoolean()).isTrue();
    assertThat(queueCount(student, 1)).isEqualTo(inactiveUser ? 1 : 0);
    if (inactiveUser) assertThat(queue(student, 1).get("active")).isEqualTo(false);
    assertThat(learning.count("review_masteries", student)).isZero();
    advanceOk(login, id);
    var correct = node(answerCurrent(login, id, true));
    assertThat(correct.path("reviewPromptEligible").asBoolean()).isFalse();
  }

  @ParameterizedTest
  @ValueSource(booleans = {true, false})
  void activeUserEntrySurvivesCorrectAnswersAndSuppressesWrongPrompts(boolean correct)
      throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    complete(login, sessionId(startDay(login, 1, UUID.randomUUID())), true, true, true, true, true);
    seedQueue(student, 1, "USER_AFTER_LATER_WRONG", true);
    var original = queue(student, 1);
    var id = sessionId(review(login, List.of(1), UUID.randomUUID()));
    var result = node(answerCurrent(login, id, correct));
    assertThat(result.path("reviewPromptEligible").asBoolean()).isFalse();
    assertThat(queue(student, 1)).isEqualTo(original);
    assertThat(learning.count("review_masteries", student)).isEqualTo(correct ? 1 : 0);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "null-list",
        "empty",
        "duplicate",
        "zero",
        "too-large",
        "null-id",
        "day",
        "missing-request"
      })
  void reviewRejectsInvalidCommandsBeforeWriting(String invalid) throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    var body = reviewBody(List.of(1), UUID.randomUUID());
    switch (invalid) {
      case "null-list" -> body.put("questionIds", null);
      case "empty" -> body.put("questionIds", List.of());
      case "duplicate" -> body.put("questionIds", List.of(1, 1));
      case "zero" -> body.put("questionIds", List.of(0));
      case "too-large" -> body.put("questionIds", List.of(151));
      case "null-id" -> body.put("questionIds", java.util.Arrays.asList(1, null));
      case "day" -> body.put("dayNumber", 1);
      case "missing-request" -> body.remove("requestId");
    }
    assertError(send("/api/student/learning/sessions", login, body), 400, "VALIDATION_ERROR");
    assertThat(learning.count("learning_sessions", student)).isZero();
    assertThat(learning.count("idempotency_records", student)).isZero();
  }

  @ParameterizedTest
  @ValueSource(strings = {"absent", "inactive", "other-student", "other-version"})
  void reviewRequiresEverySelectedQueueEntryForThePrincipalAndActiveVersion(String invalid)
      throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    seedQueue(student, 1, "AUTO_FIRST_WRONG", true);
    if (invalid.equals("inactive")) seedQueue(student, 2, "AUTO_FIRST_WRONG", false);
    if (invalid.equals("other-student")) seedQueue(student(), 2, "AUTO_FIRST_WRONG", true);
    if (invalid.equals("other-version")) {
      var version = "private-old-" + UUID.randomUUID();
      jdbc.update(
          "insert into content_versions(version,digest,active) values (?, ?,false)",
          version,
          "d".repeat(64));
      jdbc.update("insert into content_days(version,day,title) values (?,1,'old')", version);
      jdbc.update(
          "insert into"
              + " questions(version,question_id,day,position,text,answer,explanation,time_limit_seconds)"
              + " values (?,2,1,2,'old','O','old',10)",
          version);
      jdbc.update(
          "insert into"
              + " review_queue_entries(student_account_id,version,question_id,reason,active,created_at)"
              + " values (?,?,2,'AUTO_FIRST_WRONG',true,?)",
          student.getId(),
          version,
          now());
    }
    assertError(
        send("/api/student/learning/sessions", login, reviewBody(List.of(1, 2), UUID.randomUUID())),
        400,
        "VALIDATION_ERROR");
    assertThat(learning.count("learning_sessions", student)).isZero();
    assertThat(learning.count("day_attempts", student)).isZero();
    assertThat(learning.count("idempotency_records", student)).isZero();
  }

  @Test
  void reviewStartConflictsOnDifferentOrderOrModeAndIdempotencyPinsTheOriginalTarget()
      throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    firstWrongDay(login);
    var request = UUID.randomUUID();
    var original = node(review(login, List.of(2, 1), request));
    assertError(
        send("/api/student/learning/sessions", login, reviewBody(List.of(1, 2), UUID.randomUUID())),
        409,
        "SESSION_CONFLICT");
    assertError(
        send("/api/student/learning/sessions", login, reviewBody(List.of(2), UUID.randomUUID())),
        409,
        "SESSION_CONFLICT");
    assertError(
        send("/api/student/learning/sessions", login, startBody(1, UUID.randomUUID())),
        409,
        "SESSION_CONFLICT");
    assertError(
        send("/api/student/learning/sessions", login, reviewBody(List.of(1, 2), request)),
        409,
        "IDEMPOTENCY_KEY_REUSED");
    assertThat(
            node(send("/api/student/learning/sessions", login, reviewBody(List.of(2, 1), request))))
        .isEqualTo(original);
    assertThat(learning.count("learning_sessions", student)).isEqualTo(2);
  }

  @Test
  void reviewAnswerReplayKeepsExactSnapshotAfterOtherAnswersAndRejectsNewFinalizedKeys()
      throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    firstWrongDay(login);
    var id = sessionId(review(login, List.of(1, 2), UUID.randomUUID()));
    var request = UUID.randomUUID();
    var original = node(answer(login, id, request, 1, choice(1, true)));
    assertError(answer(login, id, UUID.randomUUID(), 2, choice(2, true)), 409, "QUESTION_MISMATCH");
    advanceOk(login, id);
    answerCurrent(login, id, true);
    assertThat(node(answer(login, id, request, 1, choice(1, true)))).isEqualTo(original);
    assertError(
        answer(login, id, UUID.randomUUID(), 1, choice(1, true)), 409, "ANSWER_ALREADY_FINALIZED");
    assertError(answer(login, id, request, 1, choice(1, false)), 409, "IDEMPOTENCY_KEY_REUSED");
    assertThat(learning.count("review_attempts", student)).isEqualTo(2);
    assertThat(learning.count("review_masteries", student)).isEqualTo(2);
  }

  @Test
  void reviewExpiryUsesDeterministicIdsAndSessionCountsAndNeverCreatesMasteryForTimeout()
      throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    firstWrongDay(login);
    var id = sessionId(review(login, List.of(3, 1), UUID.randomUUID()));
    var deadline = deadline(node(session(login, id)));
    var tx = new TransactionTemplate(transactions);
    java.util.Optional<AnswerResult> boundary =
        tx.execute(status -> finalizer.finalizeExpired(id, deadline));
    assertThat(boundary).isEmpty();
    AnswerResult result =
        tx.execute(status -> finalizer.finalizeExpired(id, deadline.plusNanos(1)).orElseThrow());
    assertThat(result.outcome()).isEqualTo(AnswerOutcome.TIMED_OUT);
    assertThat(result.attemptAnsweredCount()).isEqualTo(1);
    assertThat(result.attemptCorrectCount()).isZero();
    assertThat(result.xpAwarded()).isEqualTo(1);
    assertThat(result.attemptState()).isNull();
    assertThat(result.dayState()).isNull();
    assertThat(result.nextDayAvailable()).isFalse();
    assertThat(
            jdbc.queryForObject(
                "select request_id from review_attempts where id=?",
                UUID.class,
                result.attemptAnswerId()))
        .isEqualTo(ExpiryRequestId.forQuestion(id, 1, deadline));
    java.util.Optional<AnswerResult> retried =
        tx.execute(status -> finalizer.finalizeExpired(id, deadline.plusSeconds(1)));
    assertThat(retried).isEmpty();
    assertThat(learning.count("review_masteries", student)).isZero();
    assertAuto(student, 3, true, null);
    advanceOk(login, id);
    var lastDeadline = deadline(node(session(login, id)));
    tx.execute(status -> finalizer.finalizeExpired(id, lastDeadline.plusNanos(1)));
    assertThat(node(session(login, id)).path("state").asString()).isEqualTo("COMPLETED");
    assertThat(node(session(login, id)).path("answeredCount").asInt()).isEqualTo(2);
  }

  @Test
  void snapshotFailureRollsBackReviewFactXpProjectionMasteryAndAutoReleaseThenSameRequestSucceeds()
      throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    firstWrongDay(login);
    var id = sessionId(review(login, List.of(1), UUID.randomUUID()));
    var originalQueue = queue(student, 1);
    var originalLast =
        jdbc.queryForMap(
            "select * from last_answers where student_account_id=? and question_id=1",
            student.getId());
    var beforeXp = xp.sumAmountByStudentAccountId(student.getId());
    var command = new SubmitAnswerCommand(UUID.randomUUID(), 1, choice(1, true));
    jdbc.execute(
        "alter table idempotency_records add constraint task7_snapshot_failure check (operation <>"
            + " 'SUBMIT_ANSWER' or student_account_id <> '"
            + student.getId()
            + "') not valid");
    try {
      assertThatThrownBy(() -> answers.answer(AuthenticationModule.principal(student), id, command))
          .isInstanceOfSatisfying(
              org.hibernate.exception.ConstraintViolationException.class,
              failure ->
                  assertThat(failure.getConstraintName()).isEqualTo("task7_snapshot_failure"));
      assertThat(learning.count("review_attempts", student)).isZero();
      assertThat(learning.count("review_masteries", student)).isZero();
      assertThat(xp.sumAmountByStudentAccountId(student.getId())).isEqualTo(beforeXp);
      assertThat(queue(student, 1)).isEqualTo(originalQueue);
      assertThat(
              jdbc.queryForMap(
                  "select * from last_answers where student_account_id=? and question_id=1",
                  student.getId()))
          .isEqualTo(originalLast);
      assertThat(node(session(login, id)).path("state").asString()).isEqualTo("QUESTION_ACTIVE");
      assertThat(node(session(login, id)).path("answeredCount").asInt()).isZero();
    } finally {
      jdbc.execute("alter table idempotency_records drop constraint task7_snapshot_failure");
    }
    assertThat(answers.answer(AuthenticationModule.principal(student), id, command).xpAwarded())
        .isEqualTo(1);
    assertAuto(student, 1, false, (Timestamp) mastery(student, 1).get("mastered_at"));
  }

  @Test
  void foreignStudentCannotReadAnswerAdvanceOrResumeReviewAndStaffCannotStart() throws Exception {
    var student = student();
    var login = client.loginStudent(student);
    firstWrongDay(login);
    var id = sessionId(review(login, List.of(1), UUID.randomUUID()));
    var other = client.loginStudent(student());
    assertError(session(other, id), 404, "NOT_FOUND");
    assertError(answer(other, id, UUID.randomUUID(), 1, choice(1, true)), 404, "NOT_FOUND");
    assertError(advance(other, id, UUID.randomUUID()), 404, "NOT_FOUND");
    assertError(
        send("/api/student/learning/sessions", other, reviewBody(List.of(1), UUID.randomUUID())),
        400,
        "VALIDATION_ERROR");
    var staff = client.loginStaff(fixtures.teacher(fixtures.school("review privacy")));
    assertError(
        send("/api/student/learning/sessions", staff, reviewBody(List.of(1), UUID.randomUUID())),
        403,
        "FORBIDDEN");
    assertThat(learning.count("review_attempts", student)).isZero();
  }

  private Account student() {
    return learning.student(LocalDate.of(2026, 10, 12));
  }

  private void firstWrongDay(MockHttpSession login) throws Exception {
    complete(
        login, sessionId(startDay(login, 1, UUID.randomUUID())), false, false, false, false, false);
  }

  private LinkedHashMap<String, Object> reviewBody(List<Integer> ids, UUID request) {
    var body = new LinkedHashMap<String, Object>();
    body.put("mode", "REVIEW");
    body.put("questionIds", ids);
    body.put("requestId", request);
    return body;
  }

  private MvcResult review(MockHttpSession login, List<Integer> ids, UUID request)
      throws Exception {
    var result = send("/api/student/learning/sessions", login, reviewBody(ids, request));
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    return result;
  }

  private MvcResult replay(MockHttpSession login) throws Exception {
    var result =
        send(
            "/api/student/learning/sessions",
            login,
            Map.of("mode", "REPLAY", "dayNumber", 1, "requestId", UUID.randomUUID()));
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    return result;
  }

  private void assertReviewResult(
      tools.jackson.databind.JsonNode result, int answered, int correct) {
    assertThat(result.path("xpAwarded").asInt()).isEqualTo(1);
    assertThat(result.path("attemptAnsweredCount").asInt()).isEqualTo(answered);
    assertThat(result.path("attemptCorrectCount").asInt()).isEqualTo(correct);
    assertThat(result.path("attemptState").isNull()).isTrue();
    assertThat(result.path("dayState").isNull()).isTrue();
    assertThat(result.path("nextDayAvailable").asBoolean()).isFalse();
  }

  private Map<String, Object> queue(Account student, int question) {
    return jdbc.queryForMap(
        "select * from review_queue_entries where student_account_id=? and version='hanbit-v1' and"
            + " question_id=?",
        student.getId(),
        question);
  }

  private Map<String, Object> mastery(Account student, int question) {
    return jdbc.queryForMap(
        "select * from review_masteries where student_account_id=? and version='hanbit-v1' and"
            + " question_id=?",
        student.getId(),
        question);
  }

  private int queueCount(Account student, int question) {
    return jdbc.queryForObject(
        "select count(*) from review_queue_entries where student_account_id=? and"
            + " version='hanbit-v1' and question_id=?",
        Integer.class,
        student.getId(),
        question);
  }

  private void assertAuto(Account student, int question, boolean active, Timestamp release) {
    var row = queue(student, question);
    assertThat(row.get("reason")).isEqualTo("AUTO_FIRST_WRONG");
    assertThat(row.get("active")).isEqualTo(active);
    assertThat(row.get("released_at")).isEqualTo(release);
    assertThat(queueCount(student, question)).isEqualTo(1);
  }

  private Timestamp now() {
    return Timestamp.from(LearningTime.persistable(clock.instant()));
  }

  private void seedQueue(Account student, int question, String reason, boolean active) {
    jdbc.update(
        "insert into"
            + " review_queue_entries(student_account_id,version,question_id,reason,active,created_at,released_at)"
            + " values (?,'hanbit-v1',?,?,?,?,?)",
        student.getId(),
        question,
        reason,
        active,
        now(),
        active ? null : now());
  }
}
