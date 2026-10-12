package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.hanbit.school.learning.xp.XpEntry;
import kr.hanbit.school.learning.xp.XpEntryRepository;
import kr.hanbit.school.learning.xp.XpKind;
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
class LearningReplayIT extends LearningAnswerTestSupport {
  @Autowired DayAttemptRepository attempts;
  @Autowired DayProgressRepository progress;
  @Autowired LearningSessionRepository sessions;
  @Autowired LastAnswerRepository lastAnswers;
  @Autowired XpEntryRepository xpEntries;
  @Autowired LearningAnswerFinalizer finalizer;
  @Autowired PlatformTransactionManager transactions;

  @Test
  void retryPassPreservesFirstFactsAndWritesFiveIndependentOneXpRepeatFacts() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 11));
    var login = client.loginStudent(student);
    var firstId = sessionId(startDay(login, 1, UUID.randomUUID()));
    complete(login, firstId, true, true, false, false, false);
    var firstFacts =
        jdbc.queryForList(
            "select * from first_answers where student_account_id=? order by question_id",
            student.getId());
    var day =
        progress
            .findByStudentAccountIdAndVersionAndDay(student.getId(), "hanbit-v1", 1)
            .orElseThrow();
    var id = sessionId(replay(login, 1, UUID.randomUUID()));
    assertThat(id).isNotEqualTo(firstId);
    assertThat(attempts.findBySessionId(id))
        .get()
        .satisfies(
            a -> {
              assertThat(a.getAttemptNumber()).isEqualTo(2);
              assertThat(a.getAnsweredCount()).isZero();
              assertThat(a.getCorrectCount()).isZero();
              assertThat(a.getDayProgressId()).isEqualTo(day.getId());
            });
    assertThat(progress.findById(day.getId()))
        .get()
        .extracting(DayProgress::getState)
        .isEqualTo(DayProgressState.IN_PROGRESS);
    var results = complete(login, id, true, true, true, false, false);
    assertThat(results.stream().map(this::awarded).toList()).containsExactly(1, 1, 1, 1, 1125);
    var fifth = node(results.get(4));
    assertThat(fifth.path("attemptCorrectCount").asInt()).isEqualTo(3);
    assertThat(fifth.path("attemptAnsweredCount").asInt()).isEqualTo(5);
    assertThat(fifth.path("attemptState").asString()).isEqualTo("PASSED");
    assertThat(fifth.path("dayState").asString()).isEqualTo("PASSED");
    assertThat(fifth.path("nextDayAvailable").asBoolean()).isTrue();
    assertThat(node(session(login, id)).path("state").asString()).isEqualTo("COMPLETED");
    assertThat(node(session(client.loginStudent(student), id)).path("lastAnswer")).isEqualTo(fifth);
    assertThat(
            jdbc.queryForList(
                "select * from first_answers where student_account_id=? order by question_id",
                student.getId()))
        .isEqualTo(firstFacts);
    assertThat(learning.count("review_attempts", student)).isEqualTo(5);
    assertThat(
            jdbc.queryForList(
                "select amount from xp_entries where student_account_id=? and kind='REPEAT_ANSWER'",
                Integer.class,
                student.getId()))
        .containsExactly(1, 1, 1, 1, 1);
    for (var result : results) {
      var row = node(result);
      var source = UUID.fromString(row.path("attemptAnswerId").asString());
      assertThat(xpEntries.countByKindAndSourceId(XpKind.REPEAT_ANSWER, source)).isEqualTo(1);
      assertThat(
              jdbc.queryForObject(
                  "select request_id is not null and mode='REPLAY' and day_attempt_id=? from"
                      + " review_attempts where id=?",
                  Boolean.class,
                  attempts.findBySessionId(id).orElseThrow().getId(),
                  source))
          .isTrue();
      assertThat(
              lastAnswers.findById(
                  new LastAnswerId(student.getId(), "hanbit-v1", row.path("questionId").asInt())))
          .get()
          .satisfies(
              last -> {
                assertThat(last.getSourceType()).isEqualTo(AnswerSourceType.REPEAT);
                assertThat(last.getSourceId()).isEqualTo(source);
              });
    }
    assertThat(xpEntries.countByKindAndSourceId(XpKind.FIRST_DAY_PASS, day.getId())).isEqualTo(1);
    assertThat(node(status(login)).path("firstAnswerCount").asInt()).isEqualTo(5);
    assertThat(node(status(login)).path("earliestUnpassedDay").asInt()).isEqualTo(2);
    var thirdAttempt = sessionId(replay(login, 1, UUID.randomUUID()));
    assertThat(awarded(complete(login, thirdAttempt, true, true, true, true, true).get(4)))
        .isEqualTo(1);
    assertThat(attempts.findBySessionId(thirdAttempt))
        .get()
        .extracting(DayAttempt::getAttemptNumber)
        .isEqualTo(3);
    assertThat(xpEntries.countByKindAndSourceId(XpKind.FIRST_DAY_PASS, day.getId())).isEqualTo(1);
    assertThat(
            jdbc.queryForList(
                "select * from first_answers where student_account_id=? order by question_id",
                student.getId()))
        .isEqualTo(firstFacts);
    startDay(login, 2, UUID.randomUUID());
  }

  @ParameterizedTest
  @CsvSource({"2026-10-12,1126,false", "2026-10-11,1125,true"})
  void retryPassUsesExactOnTimeOrCatchUpTransactionXp(
      LocalDate startDate, int fifthXp, boolean catchUp) throws Exception {
    var student = learning.student(startDate);
    var login = client.loginStudent(student);
    complete(
        login, sessionId(startDay(login, 1, UUID.randomUUID())), true, true, false, false, false);
    var totalBefore = xpEntries.sumAmountByStudentAccountId(student.getId());
    var id = sessionId(replay(login, 1, UUID.randomUUID()));
    var results = complete(login, id, true, true, true, true, true);
    assertThat(results.stream().map(this::awarded).toList()).containsExactly(1, 1, 1, 1, fifthXp);
    assertThat(node(results.get(4)).path("totalXp").asLong()).isEqualTo(totalBefore + 4 + fifthXp);
    assertThat(node(results.get(4)).path("nextDayAvailable").asBoolean()).isEqualTo(catchUp);
    assertThat(attempts.findBySessionId(id))
        .get()
        .extracting(DayAttempt::isCatchUp)
        .isEqualTo(catchUp);
  }

  @ParameterizedTest
  @ValueSource(booleans = {true, false})
  void fifthReplayReclassifiesCatchUpAtSeoulMidnightAndKeepsTheDeadline(boolean passed)
      throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    complete(
        login, sessionId(startDay(login, 1, UUID.randomUUID())), true, true, false, false, false);
    clock.setInstant(Instant.parse("2026-10-12T14:59:55.123456789Z"));
    var id = sessionId(replay(login, 1, UUID.randomUUID()));
    complete(login, id, true, true, passed, false);
    var fifthPrompt = node(advanceOk(login, id));
    assertThat(attempts.findBySessionId(id))
        .get()
        .extracting(DayAttempt::isCatchUp)
        .isEqualTo(false);
    clock.setInstant(Instant.parse("2026-10-12T15:00:00Z"));
    assertThat(deadline(node(session(login, id)))).isEqualTo(deadline(fifthPrompt));
    var fifth = node(answerCurrent(login, id, false));
    assertThat(fifth.path("xpAwarded").asInt()).isEqualTo(passed ? 1125 : 1);
    assertThat(fifth.path("nextDayAvailable").asBoolean()).isEqualTo(passed);
    assertThat(fifth.path("dayState").asString()).isEqualTo(passed ? "PASSED" : "RETRY_REQUIRED");
    assertThat(attempts.findBySessionId(id))
        .get()
        .satisfies(
            a -> {
              assertThat(a.isCatchUp()).isTrue();
              assertThat(a.getFinishedAt()).isEqualTo(Instant.parse("2026-10-12T15:00:00Z"));
            });
    var dayId = attempts.findBySessionId(id).orElseThrow().getDayProgressId();
    if (passed)
      assertThat(
              jdbc.queryForObject(
                  "select amount from xp_entries where kind='FIRST_DAY_PASS' and source_id=?",
                  Integer.class,
                  dayId))
          .isEqualTo(1124);
    else assertThat(xpEntries.countByKindAndSourceId(XpKind.FIRST_DAY_PASS, dayId)).isZero();
  }

  @ParameterizedTest
  @ValueSource(ints = {0, 1, 2, 3, 4, 5})
  void replayPassThresholdIsThreeAndFailedRetriesCanStartFreshAttempts(int correctCount)
      throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 11));
    var login = client.loginStudent(student);
    complete(
        login, sessionId(startDay(login, 1, UUID.randomUUID())), false, false, false, false, false);
    var id = sessionId(replay(login, 1, UUID.randomUUID()));
    var answers = new boolean[5];
    for (int i = 0; i < correctCount; i++) answers[i] = true;
    var fifth = node(complete(login, id, answers).get(4));
    assertThat(fifth.path("attemptState").asString())
        .isEqualTo(correctCount >= 3 ? "PASSED" : "RETRY_REQUIRED");
    assertThat(fifth.path("dayState").asString())
        .isEqualTo(correctCount >= 3 ? "PASSED" : "RETRY_REQUIRED");
    assertThat(fifth.path("xpAwarded").asInt()).isEqualTo(correctCount >= 3 ? 1125 : 1);
    assertThat(fifth.path("nextDayAvailable").asBoolean()).isEqualTo(correctCount >= 3);
    if (correctCount < 3) {
      assertError(
          send("/api/student/learning/sessions", login, startBody(2, UUID.randomUUID())),
          409,
          "PREVIOUS_DAY_NOT_PASSED");
      var next = sessionId(replay(login, 1, UUID.randomUUID()));
      assertThat(attempts.findBySessionId(next))
          .get()
          .extracting(DayAttempt::getAttemptNumber)
          .isEqualTo(3);
    }
  }

  @ParameterizedTest
  @ValueSource(booleans = {true, false})
  void passedDayReplayNeverChangesThePassOrPaysAnotherBonus(boolean correct) throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 11));
    var login = client.loginStudent(student);
    complete(login, sessionId(startDay(login, 1, UUID.randomUUID())), true, true, true, true, true);
    var day =
        progress
            .findByStudentAccountIdAndVersionAndDay(student.getId(), "hanbit-v1", 1)
            .orElseThrow();
    var total = xpEntries.sumAmountByStudentAccountId(student.getId());
    var id = sessionId(replay(login, 1, UUID.randomUUID()));
    assertThat(progress.findById(day.getId()))
        .get()
        .extracting(DayProgress::getState)
        .isEqualTo(DayProgressState.PASSED);
    var results = complete(login, id, correct, correct, correct, correct, correct);
    assertThat(results.stream().map(this::awarded).toList()).containsExactly(1, 1, 1, 1, 1);
    assertThat(node(results.get(4)).path("dayState").asString()).isEqualTo("PASSED");
    assertThat(node(results.get(4)).path("attemptState").asString())
        .isEqualTo(correct ? "PASSED" : "RETRY_REQUIRED");
    assertThat(progress.findById(day.getId()))
        .get()
        .satisfies(
            p -> {
              assertThat(p.getPassedAt()).isEqualTo(day.getPassedAt());
              assertThat(p.getUpdatedAt()).isEqualTo(day.getUpdatedAt());
            });
    assertThat(xpEntries.countByKindAndSourceId(XpKind.FIRST_DAY_PASS, day.getId())).isEqualTo(1);
    assertThat(xpEntries.sumAmountByStudentAccountId(student.getId())).isEqualTo(total + 5);
  }

  @Test
  void replayStartSnapshotsResumeSafelyAndRejectDifferentActiveTargets() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 11));
    var login = client.loginStudent(student);
    complete(
        login, sessionId(startDay(login, 1, UUID.randomUUID())), true, true, true, false, false);
    learning.progress(student, 2, DayProgressState.RETRY_REQUIRED);
    var request = UUID.randomUUID();
    var initial = replay(login, 1, request);
    var id = sessionId(initial);
    answerCurrent(login, id, true);
    assertThat(node(replay(login, 1, request))).isEqualTo(node(initial));
    assertThat(node(replay(login, 1, UUID.randomUUID())))
        .isEqualTo(node(session(client.loginStudent(student), id)));
    assertError(replayRaw(login, 2, UUID.randomUUID()), 409, "SESSION_CONFLICT");
    assertError(replayRaw(login, 2, request), 409, "IDEMPOTENCY_KEY_REUSED");
    assertThat(learning.count("day_attempts", student)).isEqualTo(2);
    assertThat(node(initial).path("question").has("correctChoice")).isFalse();
    assertThat(node(initial).path("question").has("explanation")).isFalse();
    assertThat(node(initial).path("lastAnswer").isNull()).isTrue();
  }

  @Test
  void replayAcceptsNullQuestionListAndAnUnchangedStartRetryAfterCompletion() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    learning.progress(student, 1, DayProgressState.RETRY_REQUIRED);
    var login = client.loginStudent(student);
    var request = UUID.randomUUID();
    var initial =
        startRaw(
            login,
            "{\"mode\":\"REPLAY\",\"dayNumber\":1,\"questionIds\":null,\"requestId\":\""
                + request
                + "\"}");
    assertThat(initial.getResponse().getStatus()).isEqualTo(200);
    var id = sessionId(initial);
    complete(login, id, true, true, true, true, true);
    var retried = replayRaw(login, 1, request);
    assertThat(retried.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(retried)).isEqualTo(node(initial));
    assertThat(learning.count("learning_sessions", student)).isEqualTo(1);
    assertThat(learning.count("day_attempts", student)).isEqualTo(1);
  }

  @Test
  void replayRejectsUnstartedFutureAndLaterBlockedDaysButPermitsAnyPassedDay() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 10));
    var login = client.loginStudent(student);
    assertError(replayRaw(login, 1, UUID.randomUUID()), 400, "VALIDATION_ERROR");
    assertError(replayRaw(login, 4, UUID.randomUUID()), 403, "DAY_NOT_YET_AVAILABLE");
    learning.progress(student, 2, DayProgressState.RETRY_REQUIRED);
    assertError(replayRaw(login, 2, UUID.randomUUID()), 409, "PREVIOUS_DAY_NOT_PASSED");
    learning.progress(student, 3, DayProgressState.PASSED);
    replay(login, 3, UUID.randomUUID());
    assertThat(learning.count("day_attempts", student)).isEqualTo(1);
    assertThat(learning.count("first_answers", student)).isZero();
  }

  @ParameterizedTest
  @ValueSource(strings = {"nullDay", "zeroDay", "largeDay", "questions", "nullRequest"})
  void replayRequiresADayEmptyQuestionsAndRequestId(String invalid) throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var body = new java.util.HashMap<String, Object>();
    body.put("mode", "REPLAY");
    body.put(
        "dayNumber",
        invalid.equals("nullDay")
            ? null
            : invalid.equals("zeroDay") ? 0 : invalid.equals("largeDay") ? 31 : 1);
    body.put("questionIds", invalid.equals("questions") ? List.of(1) : null);
    body.put("requestId", invalid.equals("nullRequest") ? null : UUID.randomUUID());
    assertError(send("/api/student/learning/sessions", login, body), 400, "VALIDATION_ERROR");
    assertThat(learning.count("learning_sessions", student)).isZero();
    assertThat(learning.count("day_progress", student)).isZero();
  }

  @Test
  void
      sameReplayAnswerReturnsItsOriginalSnapshotAfterLaterXpAndNewKeysRejectOnlyFinalizedReplayQuestions()
          throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    complete(
        login, sessionId(startDay(login, 1, UUID.randomUUID())), true, true, false, false, false);
    var id = sessionId(replay(login, 1, UUID.randomUUID()));
    assertError(answer(login, id, UUID.randomUUID(), 2, choice(2, true)), 409, "QUESTION_MISMATCH");
    var request = UUID.randomUUID();
    var first = answer(login, id, request, 1, choice(1, true));
    assertThat(first.getResponse().getStatus()).isEqualTo(200);
    assertError(
        answer(login, id, UUID.randomUUID(), 1, choice(1, true)), 409, "ANSWER_ALREADY_FINALIZED");
    advanceOk(login, id);
    assertError(
        answer(login, id, UUID.randomUUID(), 1, choice(1, true)), 409, "ANSWER_ALREADY_FINALIZED");
    complete(login, id, true, true, true, true);
    assertThat(node(answer(login, id, request, 1, choice(1, true)))).isEqualTo(node(first));
    assertError(answer(login, id, request, 1, choice(1, false)), 409, "IDEMPOTENCY_KEY_REUSED");
    assertError(
        answer(login, id, UUID.randomUUID(), 5, choice(5, true)), 409, "ANSWER_ALREADY_FINALIZED");
    assertThat(learning.count("review_attempts", student)).isEqualTo(5);
  }

  @ParameterizedTest
  @ValueSource(longs = {0, 1})
  void replayDeadlineEqualityIsAcceptedAndOneNanosecondLateDiscardsChoice(long nanos)
      throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    learning.progress(student, 1, DayProgressState.RETRY_REQUIRED);
    var login = client.loginStudent(student);
    var id = sessionId(replay(login, 1, UUID.randomUUID()));
    var limit = deadline(node(session(login, id)));
    clock.setInstant(limit.plusNanos(nanos));
    var request = UUID.randomUUID();
    var result = node(answer(login, id, request, 1, choice(1, true)));
    assertThat(result.path("outcome").asString()).isEqualTo(nanos == 0 ? "CORRECT" : "TIMED_OUT");
    assertThat(result.path("xpAwarded").asInt()).isEqualTo(1);
    var fact = jdbc.queryForMap("select * from review_attempts where session_id=?", id);
    assertThat(fact.get("choice")).isEqualTo(nanos == 0 ? choice(1, true).name() : null);
    assertThat(fact.get("request_id")).isEqualTo(request);
    assertThat(fact.get("timed_out")).isEqualTo(nanos != 0);
    assertThat(learning.count("first_answers", student)).isZero();
  }

  @Test
  void replayFifthExpiryUsesDeterministicRequestAndCommitsExactlyOnePass() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    learning.progress(student, 1, DayProgressState.RETRY_REQUIRED);
    var login = client.loginStudent(student);
    var id = sessionId(replay(login, 1, UUID.randomUUID()));
    complete(login, id, true, true, true, false);
    var fifth = node(advanceOk(login, id));
    var limit = deadline(fifth);
    var tx = new TransactionTemplate(transactions);
    java.util.Optional<AnswerResult> atDeadline =
        tx.execute(status -> finalizer.finalizeExpired(id, limit));
    assertThat(atDeadline).isEmpty();
    var result =
        tx.execute(status -> finalizer.finalizeExpired(id, limit.plusNanos(1))).orElseThrow();
    assertThat(result.outcome()).isEqualTo(AnswerOutcome.TIMED_OUT);
    assertThat(result.xpAwarded()).isEqualTo(1126);
    assertThat(result.attemptState()).isEqualTo(DayAttemptState.PASSED);
    assertThat(result.dayState()).isEqualTo(DayProgressState.PASSED);
    assertThat(
            jdbc.queryForObject(
                "select request_id from review_attempts where id=?",
                UUID.class,
                result.attemptAnswerId()))
        .isEqualTo(ExpiryRequestId.forQuestion(id, 5, limit));
    java.util.Optional<AnswerResult> repeated =
        tx.execute(status -> finalizer.finalizeExpired(id, limit.plusSeconds(1)));
    assertThat(repeated).isEmpty();
    assertThat(learning.count("review_attempts", student)).isEqualTo(5);
    assertThat(learning.count("xp_entries", student)).isEqualTo(6);
    assertThat(node(session(login, id)).path("lastAnswer"))
        .isEqualTo(json.readTree(json.writeValueAsString(result)));
  }

  @Test
  void replayPassXpCollisionRollsBackFifthFactProjectionAndCompletionAndCanRetry()
      throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    complete(
        login, sessionId(startDay(login, 1, UUID.randomUUID())), true, true, false, false, false);
    var id = sessionId(replay(login, 1, UUID.randomUUID()));
    complete(login, id, true, true, true, true);
    advanceOk(login, id);
    var before = node(session(login, id));
    var projection =
        jdbc.queryForMap(
            "select * from last_answers where student_account_id=? and question_id=5",
            student.getId());
    var dayId = attempts.findBySessionId(id).orElseThrow().getDayProgressId();
    var collision =
        new XpEntry(
            UUID.randomUUID(),
            student.getId(),
            XpKind.FIRST_DAY_PASS,
            dayId,
            1125,
            clock.instant());
    xpEntries.saveAndFlush(collision);
    var total = xpEntries.sumAmountByStudentAccountId(student.getId());
    var request = UUID.randomUUID();
    assertThatThrownBy(() -> answer(login, id, request, 5, choice(5, true)))
        .hasStackTraceContaining("uq_xp_source");
    assertThat(node(session(login, id))).isEqualTo(before);
    assertThat(learning.count("review_attempts", student)).isEqualTo(4);
    assertThat(learning.count("first_answers", student)).isEqualTo(5);
    assertThat(
            jdbc.queryForMap(
                "select * from last_answers where student_account_id=? and question_id=5",
                student.getId()))
        .isEqualTo(projection);
    assertThat(attempts.findBySessionId(id))
        .get()
        .satisfies(
            a -> {
              assertThat(a.getAnsweredCount()).isEqualTo(4);
              assertThat(a.getState()).isEqualTo(DayAttemptState.ACTIVE);
              assertThat(a.getFinishedAt()).isNull();
            });
    assertThat(progress.findById(dayId))
        .get()
        .extracting(DayProgress::getState)
        .isEqualTo(DayProgressState.IN_PROGRESS);
    assertThat(xpEntries.sumAmountByStudentAccountId(student.getId())).isEqualTo(total);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from idempotency_records where student_account_id=? and"
                    + " operation='SUBMIT_ANSWER' and request_id=?",
                Integer.class,
                student.getId(),
                request))
        .isZero();
    xpEntries.deleteById(collision.getId());
    var retry = answer(login, id, request, 5, choice(5, true));
    assertThat(retry.getResponse().getStatus()).isEqualTo(200);
    assertThat(awarded(retry)).isEqualTo(1126);
  }

  private MvcResult replayRaw(MockHttpSession login, int day, UUID request) throws Exception {
    return send(
        "/api/student/learning/sessions",
        login,
        Map.of("mode", "REPLAY", "dayNumber", day, "questionIds", List.of(), "requestId", request));
  }

  private MvcResult replay(MockHttpSession login, int day, UUID request) throws Exception {
    var response = replayRaw(login, day, request);
    assertThat(response.getResponse().getStatus()).isEqualTo(200);
    return response;
  }

  private int awarded(MvcResult result) {
    try {
      return node(result).path("xpAwarded").asInt();
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
