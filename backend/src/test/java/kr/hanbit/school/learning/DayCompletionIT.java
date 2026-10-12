package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
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
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({
  PostgresTestConfiguration.class,
  LearningTestClockConfiguration.class,
  SessionTestClient.class
})
class DayCompletionIT extends LearningAnswerTestSupport {
  @Autowired DayAttemptRepository attempts;
  @Autowired DayProgressRepository progress;
  @Autowired LearningSessionRepository sessions;
  @Autowired XpEntryRepository xpEntries;
  @Autowired LearningAnswerFinalizer finalizer;
  @Autowired PlatformTransactionManager transactions;

  @Test
  void expiryOfTheFifthQuestionAlsoCommitsCompletionAndThePassBonus() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    complete(login, id, true, true, true, true);
    var fifthPrompt = advanceOk(login, id);
    var limit = deadline(node(fifthPrompt));
    var result =
        new TransactionTemplate(transactions)
            .execute(status -> finalizer.finalizeExpired(id, limit.plusNanos(1)))
            .orElseThrow();
    assertThat(result.outcome()).isEqualTo(AnswerOutcome.TIMED_OUT);
    assertThat(result.xpAwarded()).isEqualTo(1500);
    assertThat(result.totalXp()).isEqualTo(4135);
    assertThat(result.attemptState()).isEqualTo(DayAttemptState.PASSED);
    assertThat(result.attemptCorrectCount()).isEqualTo(4);
    assertThat(result.attemptAnsweredCount()).isEqualTo(5);
    assertThat(sessions.findById(id))
        .get()
        .satisfies(
            row -> {
              assertThat(row.getState()).isEqualTo(LearningSessionState.COMPLETED);
              assertThat(row.getDeadlineAt()).isEqualTo(limit);
            });
    assertThat(node(session(login, id)).path("question"))
        .isEqualTo(node(fifthPrompt).path("question"));
    assertThat(node(session(login, id)).path("lastAnswer"))
        .isEqualTo(json.readTree(json.writeValueAsString(result)));
    assertThat(learning.count("first_answers", student)).isEqualTo(5);
    assertThat(learning.count("xp_entries", student)).isEqualTo(6);
  }

  @Test
  void threeCorrectAnswersPassAndUnlockTheNextDayWithoutFinalAdvance() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 11));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var results = complete(login, id, true, true, true, false, false);
    var fifth = node(results.get(4));
    assertThat(fifth.path("attemptState").asString()).isEqualTo("PASSED");
    assertThat(fifth.path("dayState").asString()).isEqualTo("PASSED");
    assertThat(fifth.path("attemptAnsweredCount").asInt()).isEqualTo(5);
    assertThat(fifth.path("attemptCorrectCount").asInt()).isEqualTo(3);
    assertThat(fifth.path("nextDayAvailable").asBoolean()).isTrue();
    assertThat(fifth.path("xpAwarded").asInt()).isEqualTo(1498);
    assertThat(fifth.path("totalXp").asLong()).isEqualTo(3939);
    assertThat(fifth.path("level").asInt()).isEqualTo(2);
    assertThat(attempts.findBySessionId(id))
        .get()
        .satisfies(
            row -> {
              assertThat(row.getState()).isEqualTo(DayAttemptState.PASSED);
              assertThat(row.getFinishedAt())
                  .isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
              assertThat(row.getAnsweredCount()).isEqualTo(5);
              assertThat(row.getCorrectCount()).isEqualTo(3);
            });
    var day =
        progress
            .findByStudentAccountIdAndVersionAndDay(student.getId(), "hanbit-v1", 1)
            .orElseThrow();
    assertThat(day.getState()).isEqualTo(DayProgressState.PASSED);
    assertThat(day.getPassedAt()).isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
    assertThat(xpEntries.countByKindAndSourceId(XpKind.FIRST_DAY_PASS, day.getId())).isEqualTo(1);
    assertThat(sessions.findById(id))
        .get()
        .extracting(LearningSession::getState)
        .isEqualTo(LearningSessionState.COMPLETED);
    var recovered = node(session(client.loginStudent(student), id));
    assertThat(recovered.path("state").asString()).isEqualTo("COMPLETED");
    assertThat(recovered.path("question").path("questionId").asInt()).isEqualTo(5);
    assertThat(recovered.path("lastAnswer")).isEqualTo(fifth);
    var current = node(status(login));
    assertThat(current.path("activeSession").isNull()).isTrue();
    assertThat(current.path("earliestUnpassedDay").asInt()).isEqualTo(2);
    assertThat(current.path("nextAction").asString()).isEqualTo("START_FIRST");
    assertThat(sessionId(startDay(login, 2, UUID.randomUUID()))).isNotEqualTo(id);
    assertThat(learning.count("first_answers", student)).isEqualTo(5);
  }

  @ParameterizedTest
  @ValueSource(ints = {0, 1, 2})
  void atMostTwoCorrectAnswersRequireRetryAndKeepTheNextDayBlocked(int correctCount)
      throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 11));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var correct = new boolean[5];
    for (int i = 0; i < correctCount; i++) correct[i] = true;
    var results = complete(login, id, correct);
    var fifth = node(results.get(4));
    assertThat(fifth.path("attemptState").asString()).isEqualTo("RETRY_REQUIRED");
    assertThat(fifth.path("dayState").asString()).isEqualTo("RETRY_REQUIRED");
    assertThat(fifth.path("nextDayAvailable").asBoolean()).isFalse();
    assertThat(fifth.path("attemptCorrectCount").asInt()).isEqualTo(correctCount);
    assertThat(attempts.findBySessionId(id))
        .get()
        .extracting(DayAttempt::getState)
        .isEqualTo(DayAttemptState.RETRY_REQUIRED);
    assertThat(progress.findByStudentAccountIdAndVersionAndDay(student.getId(), "hanbit-v1", 1))
        .get()
        .satisfies(
            day -> {
              assertThat(day.getState()).isEqualTo(DayProgressState.RETRY_REQUIRED);
              assertThat(day.getPassedAt()).isNull();
              assertThat(xpEntries.countByKindAndSourceId(XpKind.FIRST_DAY_PASS, day.getId()))
                  .isZero();
            });
    assertThat(sessions.findById(id))
        .get()
        .extracting(LearningSession::getState)
        .isEqualTo(LearningSessionState.COMPLETED);
    assertError(
        send("/api/student/learning/sessions", login, startBody(2, UUID.randomUUID())),
        409,
        "PREVIOUS_DAY_NOT_PASSED");
    assertThat(node(status(login)).path("nextAction").asString()).isEqualTo("START_REPLAY");
    assertThat(learning.count("xp_entries", student)).isEqualTo(5);
    assertThat(learning.count("first_answers", student)).isEqualTo(5);
  }

  @Test
  void onTimeFifthConsecutiveCorrectIncludesPassBonusAndNoncumulativeStreakXp() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var results = complete(login, id, true, true, true, true, true);
    assertThat(
            results.stream()
                .map(result -> nodeUnchecked(result).path("xpAwarded").asInt())
                .toList())
        .containsExactly(565, 565, 940, 565, 2440);
    assertThat(node(results.get(4)).path("totalXp").asLong()).isEqualTo(5075);
    assertThat(node(results.get(4)).path("level").asInt()).isEqualTo(2);
    assertThat(node(results.get(4)).path("nextDayAvailable").asBoolean()).isFalse();
    assertThat(attempts.findBySessionId(id))
        .get()
        .extracting(DayAttempt::getCurrentStreak)
        .isEqualTo(5);
    assertThat(node(status(login)).path("nextAction").asString()).isEqualTo("WAIT_FOR_NEXT_DAY");
    assertThat(
            jdbc.queryForList(
                "select amount from xp_entries where student_account_id=? order by amount",
                Integer.class,
                student.getId()))
        .containsExactly(565, 565, 565, 940, 1125, 1315);
  }

  @Test
  void catchUpAwardsExactlyOneLessPerAnswerAndOneLessForTheFirstPass() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 10));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var results = complete(login, id, true, true, true, true, true);
    assertThat(
            results.stream()
                .map(result -> nodeUnchecked(result).path("xpAwarded").asInt())
                .toList())
        .containsExactly(564, 564, 939, 564, 2438);
    assertThat(node(results.get(4)).path("totalXp").asLong()).isEqualTo(5069);
    assertThat(node(results.get(4)).path("nextDayAvailable").asBoolean()).isTrue();
    assertThat(
            jdbc.queryForList(
                "select amount from xp_entries where student_account_id=? order by amount",
                Integer.class,
                student.getId()))
        .containsExactly(564, 564, 564, 939, 1124, 1314);
  }

  @Test
  void wrongAnswerResetsTheStreakSoThreeMoreCorrectEarnOnlyTheThirdBonus() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var results = complete(login, id, true, false, true, true, true);
    assertThat(
            results.stream()
                .map(result -> nodeUnchecked(result).path("xpAwarded").asInt())
                .toList())
        .containsExactly(565, 375, 565, 565, 2065);
    assertThat(node(results.get(4)).path("totalXp").asLong()).isEqualTo(4135);
    assertThat(attempts.findBySessionId(id))
        .get()
        .extracting(DayAttempt::getCurrentStreak)
        .isEqualTo(3);
  }

  @Test
  void timeoutResetsTheStreakAndFifthAnswerStillCompletesTheAttempt() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    answerCurrent(login, id, true);
    advanceOk(login, id);
    answerCurrent(login, id, true);
    advanceOk(login, id);
    clock.setInstant(deadline(node(session(login, id))).plusNanos(1));
    var timedOut = answerCurrent(login, id, true);
    assertThat(node(timedOut).path("outcome").asString()).isEqualTo("TIMED_OUT");
    assertThat(node(timedOut).path("xpAwarded").asInt()).isEqualTo(375);
    assertThat(attempts.findBySessionId(id))
        .get()
        .extracting(DayAttempt::getCurrentStreak)
        .isEqualTo(0);
    advanceOk(login, id);
    answerCurrent(login, id, true);
    advanceOk(login, id);
    var fifth = answerCurrent(login, id, true);
    assertThat(node(fifth).path("xpAwarded").asInt()).isEqualTo(1690);
    assertThat(node(fifth).path("attemptState").asString()).isEqualTo("PASSED");
    assertThat(attempts.findBySessionId(id))
        .get()
        .extracting(DayAttempt::getCurrentStreak)
        .isEqualTo(2);
  }

  @Test
  void completedAdvanceAndAnswerRetriesNeverMintASecondFirstPass() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    complete(login, id, true, true, true, true);
    advanceOk(login, id);
    var request = UUID.randomUUID();
    var fifth = answer(login, id, request, 5, choice(5, true));
    assertThat(fifth.getResponse().getStatus()).isEqualTo(200);
    var completed = session(login, id);
    for (int i = 0; i < 3; i++) assertThat(node(advanceOk(login, id))).isEqualTo(node(completed));
    assertThat(node(answer(login, id, request, 5, choice(5, true)))).isEqualTo(node(fifth));
    assertError(
        answer(login, id, UUID.randomUUID(), 5, choice(5, true)), 409, "ANSWER_ALREADY_FINALIZED");
    assertThat(learning.count("xp_entries", student)).isEqualTo(6);
    var dayId = attempts.findBySessionId(id).orElseThrow().getDayProgressId();
    assertThat(xpEntries.countByKindAndSourceId(XpKind.FIRST_DAY_PASS, dayId)).isEqualTo(1);
    assertThat(xpEntries.sumAmountByStudentAccountId(student.getId())).isEqualTo(5075);
  }

  @Test
  void catchUpCanPassSequentialDaysUntilCalendarCap() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 10));
    var login = client.loginStudent(student);
    for (int day = 1; day <= 3; day++) {
      var before = node(status(login));
      assertThat(before.path("calendarCap").asInt()).isEqualTo(3);
      assertThat(before.path("earliestUnpassedDay").asInt()).isEqualTo(day);
      var id = sessionId(startDay(login, day, UUID.randomUUID()));
      var fifth = node(complete(login, id, true, true, true, true, true).get(4));
      assertThat(fifth.path("nextDayAvailable").asBoolean()).isEqualTo(day < 3);
      assertThat(fifth.path("xpAwarded").asInt()).isEqualTo(day < 3 ? 2438 : 2440);
    }
    var current = node(status(login));
    assertThat(current.path("earliestUnpassedDay").isNull()).isTrue();
    assertThat(current.path("passedDayCount").asInt()).isEqualTo(3);
    assertThat(current.path("firstAnswerCount").asInt()).isEqualTo(15);
    assertThat(current.path("totalXp").asLong()).isEqualTo(15213);
    assertThat(current.path("level").asInt()).isEqualTo(5);
    assertThat(current.path("nextAction").asString()).isEqualTo("WAIT_FOR_NEXT_DAY");
    assertError(
        send("/api/student/learning/sessions", login, startBody(4, UUID.randomUUID())),
        403,
        "DAY_NOT_YET_AVAILABLE");
    assertThat(learning.count("learning_sessions", student)).isEqualTo(3);
  }

  @Test
  void midnightDoesNotReclassifyActiveFirstAttempt() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    clock.setInstant(Instant.parse("2026-10-12T14:59:55.123456789Z"));
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    answerCurrent(login, id, true);
    advanceOk(login, id);
    answerCurrent(login, id, true);
    var third = advanceOk(login, id);
    var storedDeadline = deadline(node(third));
    assertThat(attempts.findBySessionId(id))
        .get()
        .extracting(DayAttempt::getCurrentStreak)
        .isEqualTo(2);
    clock.setInstant(Instant.parse("2026-10-12T15:00:00Z"));
    assertThat(node(status(login)).path("calendarCap").asInt()).isEqualTo(2);
    assertThat(deadline(node(session(client.loginStudent(student), id)))).isEqualTo(storedDeadline);
    assertThat(attempts.findBySessionId(id))
        .get()
        .extracting(DayAttempt::isCatchUp)
        .isEqualTo(false);
    var afterMidnight = answerCurrent(login, id, true);
    assertThat(node(afterMidnight).path("xpAwarded").asInt()).isEqualTo(940);
    advanceOk(login, id);
    var lastTwo = complete(login, id, true, true);
    assertThat(node(lastTwo.get(1)).path("xpAwarded").asInt()).isEqualTo(2440);
    assertThat(node(lastTwo.get(1)).path("totalXp").asLong()).isEqualTo(5075);
    assertThat(node(lastTwo.get(1)).path("nextDayAvailable").asBoolean()).isTrue();
    assertThat(attempts.findBySessionId(id))
        .get()
        .satisfies(
            row -> {
              assertThat(row.isCatchUp()).isFalse();
              assertThat(row.getCurrentStreak()).isEqualTo(5);
            });
  }

  @Test
  void fifthAnswerFailureRollsBackEverything() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    complete(login, id, true, true, true, true);
    advanceOk(login, id);
    var beforeView = node(session(login, id));
    var attemptBefore = attempts.findBySessionId(id).orElseThrow();
    var dayBefore = progress.findById(attemptBefore.getDayProgressId()).orElseThrow();
    var conflict =
        new XpEntry(
            UUID.randomUUID(),
            student.getId(),
            XpKind.FIRST_DAY_PASS,
            dayBefore.getId(),
            1125,
            clock.instant());
    xpEntries.saveAndFlush(conflict);
    var totalBefore = xpEntries.sumAmountByStudentAccountId(student.getId());
    var request = UUID.randomUUID();

    assertThatThrownBy(() -> answer(login, id, request, 5, choice(5, true)))
        .hasStackTraceContaining("uq_xp_source");

    assertThat(node(session(login, id))).isEqualTo(beforeView);
    var attemptAfter = attempts.findBySessionId(id).orElseThrow();
    assertThat(attemptAfter.getAnsweredCount()).isEqualTo(4);
    assertThat(attemptAfter.getCorrectCount()).isEqualTo(4);
    assertThat(attemptAfter.getCurrentStreak()).isEqualTo(4);
    assertThat(attemptAfter.getState()).isEqualTo(DayAttemptState.ACTIVE);
    assertThat(attemptAfter.getFinishedAt()).isNull();
    var dayAfter = progress.findById(dayBefore.getId()).orElseThrow();
    assertThat(dayAfter.getState()).isEqualTo(DayProgressState.IN_PROGRESS);
    assertThat(dayAfter.getPassedAt()).isNull();
    assertThat(dayAfter.getUpdatedAt()).isEqualTo(dayBefore.getUpdatedAt());
    assertThat(learning.count("first_answers", student)).isEqualTo(4);
    assertThat(learning.count("last_answers", student)).isEqualTo(4);
    assertThat(learning.count("xp_entries", student)).isEqualTo(5);
    assertThat(xpEntries.sumAmountByStudentAccountId(student.getId())).isEqualTo(totalBefore);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from idempotency_records where student_account_id=? and"
                    + " operation='SUBMIT_ANSWER' and request_id=?",
                Integer.class,
                student.getId(),
                request))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "select count(*) from first_answers where student_account_id=? and question_id=5",
                Integer.class,
                student.getId()))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "select count(*) from last_answers where student_account_id=? and question_id=5",
                Integer.class,
                student.getId()))
        .isZero();
    // Remove only the deliberately injected collision, then the same fifth request can succeed.
    xpEntries.deleteById(conflict.getId());
    var retried = answer(login, id, request, 5, choice(5, true));
    assertThat(retried.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(retried).path("xpAwarded").asInt()).isEqualTo(2440);
    assertThat(node(retried).path("totalXp").asLong()).isEqualTo(5075);
  }

  @Test
  void passingDayThirtyNeverUnlocksAnExtraDay() throws Exception {
    var student = learning.student(LocalDate.of(2026, 8, 1));
    learning.passedThrough(student, 29);
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 30, UUID.randomUUID()));
    var fifth = node(complete(login, id, true, true, true, false, false).get(4));
    assertThat(fifth.path("nextDayAvailable").asBoolean()).isFalse();
    assertThat(node(status(login)).path("nextAction").asString()).isEqualTo("COURSE_COMPLETE");
    assertThat(node(status(login)).path("passedDayCount").asInt()).isEqualTo(30);
  }

  private tools.jackson.databind.JsonNode nodeUnchecked(
      org.springframework.test.web.servlet.MvcResult result) {
    try {
      return node(result);
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }
}
