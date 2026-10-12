package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import kr.hanbit.school.account.AuthenticationModule;
import kr.hanbit.school.content.AnswerChoice;
import kr.hanbit.school.shared.web.ApiException;
import kr.hanbit.school.support.LearningAnswerTestSupport;
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
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({
  PostgresTestConfiguration.class,
  LearningTestClockConfiguration.class,
  SessionTestClient.class
})
class LearningAnswerIT extends LearningAnswerTestSupport {
  @Autowired LearningSessionRepository sessions;
  @Autowired DayAttemptRepository attempts;
  @Autowired FirstAnswerRepository firstAnswers;
  @Autowired LastAnswerRepository lastAnswers;
  @Autowired LearningAnswerModule module;
  @Autowired LearningAnswerFinalizer finalizer;
  @Autowired PlatformTransactionManager transactions;

  @Test
  void correctAnswerPersistsImmutableFactProjectionXpAndFeedbackAtomically() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var started = startDay(login, 1, UUID.randomUUID());
    var id = sessionId(started);
    assertThat(node(started).toString()).doesNotContain("correctChoice", "explanation");
    clock.setInstant(Instant.parse("2026-10-12T00:00:02.123456789Z"));
    var requestId = UUID.randomUUID();

    var answered = answer(login, id, requestId, 1, AnswerChoice.O);

    assertThat(answered.getResponse().getStatus()).isEqualTo(200);
    var body = node(answered);
    assertThat(body.path("outcome").asString()).isEqualTo("CORRECT");
    assertThat(body.path("correctChoice").asString()).isEqualTo("O");
    assertThat(body.path("explanation").asString())
        .isEqualTo(content.requireQuestion("hanbit-v1", 1).getExplanation());
    assertThat(body.path("xpAwarded").asInt()).isEqualTo(565);
    assertThat(body.path("totalXp").asLong()).isEqualTo(565);
    assertThat(body.path("level").asInt()).isEqualTo(1);
    assertThat(body.path("attemptAnsweredCount").asInt()).isEqualTo(1);
    assertThat(body.path("attemptCorrectCount").asInt()).isEqualTo(1);
    assertThat(body.path("attemptState").asString()).isEqualTo("ACTIVE");
    assertThat(body.path("dayState").asString()).isEqualTo("IN_PROGRESS");
    assertThat(body.path("nextDayAvailable").asBoolean()).isFalse();
    assertThat(body.path("reviewPromptEligible").asBoolean()).isFalse();
    var fact =
        firstAnswers
            .findByStudentAccountIdAndVersionAndQuestionId(student.getId(), "hanbit-v1", 1)
            .orElseThrow();
    assertThat(fact.getId().toString()).isEqualTo(body.path("attemptAnswerId").asString());
    assertThat(fact.getRequestId()).isEqualTo(requestId);
    assertThat(fact.getChoice()).isEqualTo(AnswerChoice.O);
    assertThat(fact.getAnsweredAt()).isEqualTo(Instant.parse("2026-10-12T00:00:02.123456Z"));
    assertThat(fact.getResponseMillis()).isEqualTo(2000);
    var projection =
        lastAnswers.findById(new LastAnswerId(student.getId(), "hanbit-v1", 1)).orElseThrow();
    assertThat(projection.getSourceId()).isEqualTo(fact.getId());
    assertThat(projection.getSourceType()).isEqualTo(AnswerSourceType.FIRST);
    assertThat(projection.getOutcome()).isEqualTo(AnswerOutcome.CORRECT);
    assertThat(projection.getAnsweredAt()).isEqualTo(fact.getAnsweredAt());
    assertThat(learning.count("xp_entries", student)).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "select amount from xp_entries where source_id=?", Integer.class, fact.getId()))
        .isEqualTo(565);
    assertThat(
            jdbc.queryForObject(
                "select rule_version from xp_entries where source_id=?",
                String.class,
                fact.getId()))
        .isEqualTo("learning-v1");
  }

  @Test
  void wrongAnswerStoresItsChoiceAndResetsTheAttemptStreak() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var result = answer(login, id, UUID.randomUUID(), 1, AnswerChoice.X);
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(result).path("outcome").asString()).isEqualTo("WRONG");
    assertThat(node(result).path("xpAwarded").asInt()).isEqualTo(375);
    assertThat(node(result).path("attemptCorrectCount").asInt()).isZero();
    assertThat(attempts.findBySessionId(id))
        .get()
        .extracting(DayAttempt::getCurrentStreak)
        .isEqualTo(0);
    assertThat(
            firstAnswers.findByStudentAccountIdAndVersionAndQuestionId(
                student.getId(), "hanbit-v1", 1))
        .get()
        .satisfies(
            row -> {
              assertThat(row.getChoice()).isEqualTo(AnswerChoice.X);
              assertThat(row.isTimedOut()).isFalse();
              assertThat(row.isCorrect()).isFalse();
            });
  }

  @Test
  void deadlineEqualityIsAccepted() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var started = startDay(login, 1, UUID.randomUUID());
    clock.setInstant(deadline(node(started)));
    var result = answer(login, sessionId(started), UUID.randomUUID(), 1, AnswerChoice.O);
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(result).path("outcome").asString()).isEqualTo("CORRECT");
    assertThat(node(result).path("xpAwarded").asInt()).isEqualTo(565);
    assertThat(
            firstAnswers.findByStudentAccountIdAndVersionAndQuestionId(
                student.getId(), "hanbit-v1", 1))
        .get()
        .extracting(FirstAnswer::isTimedOut)
        .isEqualTo(false);
  }

  @Test
  void oneNanosecondLateDiscardsEvenTheCorrectSubmittedChoice() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var started = startDay(login, 1, UUID.randomUUID());
    var deadline = deadline(node(started));
    clock.setInstant(deadline.plusNanos(1));
    var result = answer(login, sessionId(started), UUID.randomUUID(), 1, AnswerChoice.O);
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(result).path("outcome").asString()).isEqualTo("TIMED_OUT");
    assertThat(node(result).path("correctChoice").asString()).isEqualTo("O");
    assertThat(node(result).path("explanation").asString()).isNotBlank();
    assertThat(node(result).path("xpAwarded").asInt()).isEqualTo(375);
    var fact =
        firstAnswers
            .findByStudentAccountIdAndVersionAndQuestionId(student.getId(), "hanbit-v1", 1)
            .orElseThrow();
    assertThat(fact.getChoice()).isNull();
    assertThat(fact.isTimedOut()).isTrue();
    assertThat(fact.isCorrect()).isFalse();
    assertThat(fact.getAnsweredAt()).isEqualTo(deadline);
    assertThat(fact.getResponseMillis())
        .isEqualTo(content.requireQuestion("hanbit-v1", 1).getTimeLimitSeconds() * 1000L);
    assertThat(lastAnswers.findById(new LastAnswerId(student.getId(), "hanbit-v1", 1)))
        .get()
        .satisfies(
            row -> {
              assertThat(row.getChoice()).isNull();
              assertThat(row.getOutcome()).isEqualTo(AnswerOutcome.TIMED_OUT);
            });
  }

  @Test
  void questionMismatchDoesNotPersistAnyAnswerEffects() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var started = startDay(login, 1, UUID.randomUUID());
    var id = sessionId(started);
    assertError(answer(login, id, UUID.randomUUID(), 2, AnswerChoice.O), 409, "QUESTION_MISMATCH");
    assertThat(node(session(login, id))).isEqualTo(node(started));
    for (var table : List.of("first_answers", "last_answers", "xp_entries"))
      assertThat(learning.count(table, student)).as(table).isZero();
    assertThat(attempts.findBySessionId(id))
        .get()
        .extracting(DayAttempt::getAnsweredCount)
        .isEqualTo(0);
    assertThat(learning.count("idempotency_records", student)).isEqualTo(1);
  }

  @Test
  void newRequestAfterFinalizationNeverChangesTheFirstAnswerEvenAfterAdvance() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var original = answer(login, id, UUID.randomUUID(), 1, AnswerChoice.X);
    assertThat(original.getResponse().getStatus()).isEqualTo(200);
    assertError(
        answer(login, id, UUID.randomUUID(), 1, AnswerChoice.O), 409, "ANSWER_ALREADY_FINALIZED");
    advanceOk(login, id);
    assertError(
        answer(login, id, UUID.randomUUID(), 1, AnswerChoice.O), 409, "ANSWER_ALREADY_FINALIZED");
    assertThat(
            firstAnswers.findByStudentAccountIdAndVersionAndQuestionId(
                student.getId(), "hanbit-v1", 1))
        .get()
        .satisfies(
            row -> {
              assertThat(row.getId().toString())
                  .isEqualTo(nodeUnchecked(original).path("attemptAnswerId").asString());
              assertThat(row.getChoice()).isEqualTo(AnswerChoice.X);
              assertThat(row.isCorrect()).isFalse();
            });
    assertThat(learning.count("first_answers", student)).isEqualTo(1);
    assertThat(learning.count("xp_entries", student)).isEqualTo(1);
  }

  @Test
  void answerRetryReturnsOriginalXpSnapshotAndRejectsChangedChoiceBeforePhaseChecks()
      throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var request = UUID.randomUUID();
    var id = sessionId(startDay(login, 1, request));
    // The operation key is independent: reuse the start request ID for this answer.
    var original = answer(login, id, request, 1, AnswerChoice.O);
    assertThat(original.getResponse().getStatus()).isEqualTo(200);
    advanceOk(login, id);
    complete(login, id, true, true, true, true);
    assertThat(node(status(login)).path("totalXp").asLong()).isEqualTo(5075);
    assertThat(node(status(login)).path("level").asInt()).isEqualTo(2);
    var retry =
        raw(
            client.loginStudent(student),
            answerPath(id),
            "{\"choice\":\"O\",\"questionId\":1,\"requestId\":\"" + request + "\"}");
    assertThat(retry.getResponse().getStatus()).isEqualTo(200);
    assertThat(node(retry)).isEqualTo(node(original));
    assertThat(node(retry).path("totalXp").asLong()).isEqualTo(565);
    assertThat(node(retry).path("level").asInt()).isEqualTo(1);
    assertError(answer(login, id, request, 1, AnswerChoice.X), 409, "IDEMPOTENCY_KEY_REUSED");
    assertError(answer(login, id, request, 2, choice(2, true)), 409, "IDEMPOTENCY_KEY_REUSED");
    assertThat(learning.count("first_answers", student)).isEqualTo(5);
    assertThat(learning.count("xp_entries", student)).isEqualTo(6);
  }

  @Test
  void phaseSpecificLastAnswerAndPromptRecoverAcrossDevicesWithoutChangingDeadline()
      throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var secondLogin = client.loginStudent(student);
    var started = startDay(login, 1, UUID.randomUUID());
    var id = sessionId(started);
    assertThat(node(session(secondLogin, id))).isEqualTo(node(started));
    var answered = answerCurrent(login, id, true);
    var waiting = session(secondLogin, id);
    assertThat(node(waiting).path("state").asString()).isEqualTo("AWAITING_ADVANCE");
    assertThat(node(waiting).path("question")).isEqualTo(node(started).path("question"));
    assertThat(node(waiting).path("lastAnswer")).isEqualTo(node(answered));
    assertThat(node(startDay(secondLogin, 1, UUID.randomUUID()))).isEqualTo(node(waiting));
    assertThat(node(status(secondLogin)).path("activeSession")).isEqualTo(node(waiting));
    clock.setInstant(Instant.parse("2026-10-12T00:00:20.987654321Z"));
    var next = advanceOk(secondLogin, id);
    assertThat(node(next).path("state").asString()).isEqualTo("QUESTION_ACTIVE");
    assertThat(node(next).path("lastAnswer").isNull()).isTrue();
    assertThat(node(next).path("question").path("questionId").asInt()).isEqualTo(2);
    assertThat(deadline(node(next)))
        .isEqualTo(
            Instant.parse("2026-10-12T00:00:20.987654Z")
                .plusSeconds(content.requireQuestion("hanbit-v1", 2).getTimeLimitSeconds()));
    assertThat(node(next).toString()).doesNotContain("correctChoice", "explanation");
    assertThat(sessions.findById(id)).get().extracting(LearningSession::getLastResultJson).isNull();
    clock.setInstant(Instant.parse("2026-10-12T00:00:21Z"));
    assertThat(node(session(login, id))).isEqualTo(node(next));
  }

  @Test
  void startAndAdvanceRetriesReturnOriginalSnapshotsAfterLaterProgress() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var request = UUID.randomUUID();
    var started = startDay(login, 1, request);
    var id = sessionId(started);
    answerCurrent(login, id, true);
    var next = advance(login, id, request);
    assertThat(next.getResponse().getStatus()).isEqualTo(200);
    answerCurrent(login, id, true);
    clock.setInstant(Instant.parse("2026-10-12T00:00:10Z"));
    advanceOk(login, id);
    assertThat(node(session(login, id)).path("question").path("questionId").asInt()).isEqualTo(3);
    assertThat(node(startDay(client.loginStudent(student), 1, request))).isEqualTo(node(started));
    assertThat(node(advance(login, id, request))).isEqualTo(node(next));
    assertThat(node(session(login, id)).path("question").path("questionId").asInt()).isEqualTo(3);
    assertThat(learning.count("first_answers", student)).isEqualTo(2);
  }

  @Test
  void sameAdvanceKeyWithAnotherSessionPayloadIsRejected() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 10));
    var login = client.loginStudent(student);
    var first = sessionId(startDay(login, 1, UUID.randomUUID()));
    answerCurrent(login, first, true);
    var request = UUID.randomUUID();
    var next = advance(login, first, request);
    assertThat(next.getResponse().getStatus()).isEqualTo(200);
    complete(login, first, true, true, true, true);
    var second = sessionId(startDay(login, 2, UUID.randomUUID()));
    assertError(advance(login, second, request), 409, "IDEMPOTENCY_KEY_REUSED");
    assertThat(node(advance(login, first, request))).isEqualTo(node(next));
    assertThat(node(session(login, second)).path("question").path("questionId").asInt())
        .isEqualTo(6);
  }

  @Test
  void answerFingerprintIncludesThePathSessionBeforeCurrentQuestionChecks() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 10));
    var login = client.loginStudent(student);
    var first = sessionId(startDay(login, 1, UUID.randomUUID()));
    var request = UUID.randomUUID();
    assertThat(answer(login, first, request, 1, AnswerChoice.O).getResponse().getStatus())
        .isEqualTo(200);
    advanceOk(login, first);
    complete(login, first, true, true, true, true);
    var second = sessionId(startDay(login, 2, UUID.randomUUID()));
    assertError(answer(login, second, request, 1, AnswerChoice.O), 409, "IDEMPOTENCY_KEY_REUSED");
    assertThat(node(session(login, second)).path("answeredCount").asInt()).isZero();
  }

  @Test
  void advanceBeforeAnAnswerIsAConflictAndNeverOpensANewDeadline() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var started = startDay(login, 1, UUID.randomUUID());
    var id = sessionId(started);
    assertError(advance(login, id, UUID.randomUUID()), 409, "SESSION_CONFLICT");
    assertThat(node(session(login, id))).isEqualTo(node(started));
    assertThat(learning.count("idempotency_records", student)).isEqualTo(1);
  }

  @Test
  void firstFinalizationUpdatesAnExistingLastProjectionWithoutCreatingAnotherRow()
      throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    lastAnswers.saveAndFlush(
        new LastAnswer(
            student.getId(),
            "hanbit-v1",
            1,
            AnswerSourceType.REPEAT,
            UUID.randomUUID(),
            AnswerChoice.X,
            false,
            false,
            AnswerOutcome.WRONG,
            Instant.parse("2026-10-11T00:00:00Z")));
    var answered = answerCurrent(login, id, true);
    assertThat(learning.count("last_answers", student)).isEqualTo(1);
    assertThat(lastAnswers.findById(new LastAnswerId(student.getId(), "hanbit-v1", 1)))
        .get()
        .satisfies(
            row -> {
              assertThat(row.getSourceType()).isEqualTo(AnswerSourceType.FIRST);
              assertThat(row.getSourceId().toString())
                  .isEqualTo(nodeUnchecked(answered).path("attemptAnswerId").asString());
              assertThat(row.getChoice()).isEqualTo(AnswerChoice.O);
              assertThat(row.getOutcome()).isEqualTo(AnswerOutcome.CORRECT);
              assertThat(row.getAnsweredAt())
                  .isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
            });
  }

  @Test
  void expiryUsesTheSharedFinalizerOnlyAfterDeadlineAndItsDeterministicRequestId()
      throws Exception {
    var fixedId = UUID.fromString("00000000-0000-0000-0000-000000000001");
    var fixedDeadline = Instant.parse("2026-10-12T00:00:12.123456Z");
    // Independent Python hashlib MD5 -> UUID v3 calculation of the specified seed.
    assertThat(ExpiryRequestId.forQuestion(fixedId, 1, fixedDeadline))
        .isEqualTo(UUID.fromString("7c273b84-c8f9-317d-9989-5b8c3d55f61b"));
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var started = startDay(login, 1, UUID.randomUUID());
    var id = sessionId(started);
    var limit = deadline(node(started));
    var tx = new TransactionTemplate(transactions);
    Optional<AnswerResult> atDeadline = tx.execute(status -> expire(id, limit));
    assertThat(atDeadline).isEmpty();
    var result = tx.execute(status -> expire(id, limit.plusNanos(1))).orElseThrow();
    assertThat(result.outcome()).isEqualTo(AnswerOutcome.TIMED_OUT);
    assertThat(result.xpAwarded()).isEqualTo(375);
    var expectedId =
        UUID.nameUUIDFromBytes(
            ("learning-timeout-v1|" + id + "|1|" + limit).getBytes(StandardCharsets.UTF_8));
    assertThat(
            firstAnswers.findByStudentAccountIdAndVersionAndQuestionId(
                student.getId(), "hanbit-v1", 1))
        .get()
        .extracting(FirstAnswer::getRequestId)
        .isEqualTo(expectedId);
    Optional<AnswerResult> duplicate = tx.execute(status -> expire(id, limit.plusSeconds(1)));
    assertThat(duplicate).isEmpty();
    assertError(
        answer(login, id, UUID.randomUUID(), 1, AnswerChoice.O), 409, "ANSWER_ALREADY_FINALIZED");
    assertThat(node(session(login, id)).path("lastAnswer"))
        .isEqualTo(json.readTree(json.writeValueAsString(result)));
    assertThat(learning.count("first_answers", student)).isEqualTo(1);
    assertThat(learning.count("last_answers", student)).isEqualTo(1);
    assertThat(learning.count("xp_entries", student)).isEqualTo(1);
  }

  @Test
  void bothFinalizerEntrypointsRequireAnExistingTransaction() throws Exception {
    var command = new SubmitAnswerCommand(UUID.randomUUID(), 1, AnswerChoice.O);
    assertThatThrownBy(
            () ->
                finalizer.finalizeClient(
                    UUID.randomUUID(), UUID.randomUUID(), command, clock.instant()))
        .isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
    assertThatThrownBy(() -> expire(UUID.randomUUID(), clock.instant()))
        .isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
  }

  @Test
  void rawReceivedAtIsCapturedBeforeWaitingForTheSessionLock() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var started = startDay(login, 1, UUID.randomUUID());
    var id = sessionId(started);
    var limit = deadline(node(started));
    var locked = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var holder =
          pool.submit(
              () ->
                  new TransactionTemplate(transactions)
                      .execute(
                          status -> {
                            jdbc.queryForObject(
                                "select id from learning_sessions where id=? for update",
                                UUID.class,
                                id);
                            locked.countDown();
                            try {
                              assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
                            } catch (InterruptedException e) {
                              throw new IllegalStateException(e);
                            }
                            return null;
                          }));
      assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
      try {
        clock.setInstant(limit);
        var response = pool.submit(() -> answer(login, id, UUID.randomUUID(), 1, AnswerChoice.O));
        await()
            .atMost(Duration.ofSeconds(5))
            .until(
                () ->
                    jdbc.queryForObject(
                            "select count(*) from pg_stat_activity where datname=current_database()"
                                + " and wait_event_type='Lock' and query like"
                                + " '%learning_sessions%'",
                            Integer.class)
                        > 0);
        clock.setInstant(limit.plusSeconds(1));
        release.countDown();
        var result = response.get(10, TimeUnit.SECONDS);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(node(result).path("outcome").asString()).isEqualTo("CORRECT");
        assertThat(
                firstAnswers.findByStudentAccountIdAndVersionAndQuestionId(
                    student.getId(), "hanbit-v1", 1))
            .get()
            .extracting(FirstAnswer::getAnsweredAt)
            .isEqualTo(limit);
      } finally {
        release.countDown();
      }
      holder.get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void concurrentSameAnswerRequestReplaysOneResultAcrossLogins() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var second = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var request = UUID.randomUUID();
    var barrier = new CyclicBarrier(2);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var left =
          pool.submit(
              () -> {
                barrier.await(5, TimeUnit.SECONDS);
                return answer(login, id, request, 1, AnswerChoice.O);
              });
      var right =
          pool.submit(
              () -> {
                barrier.await(5, TimeUnit.SECONDS);
                return answer(second, id, request, 1, AnswerChoice.O);
              });
      var a = left.get(10, TimeUnit.SECONDS);
      var b = right.get(10, TimeUnit.SECONDS);
      assertThat(a.getResponse().getStatus()).isEqualTo(200);
      assertThat(b.getResponse().getStatus()).isEqualTo(200);
      assertThat(node(a)).isEqualTo(node(b));
    }
    assertThat(learning.count("first_answers", student)).isEqualTo(1);
    assertThat(learning.count("last_answers", student)).isEqualTo(1);
    assertThat(learning.count("xp_entries", student)).isEqualTo(1);
    assertThat(learning.count("idempotency_records", student)).isEqualTo(2);
  }

  @Test
  void differentConcurrentRequestsFinalizeOnlyOneAnswer() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var second = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var barrier = new CyclicBarrier(2);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var left =
          pool.submit(
              () -> {
                barrier.await(5, TimeUnit.SECONDS);
                return answer(login, id, UUID.randomUUID(), 1, AnswerChoice.O);
              });
      var right =
          pool.submit(
              () -> {
                barrier.await(5, TimeUnit.SECONDS);
                return answer(second, id, UUID.randomUUID(), 1, AnswerChoice.X);
              });
      var a = left.get(10, TimeUnit.SECONDS);
      var b = right.get(10, TimeUnit.SECONDS);
      assertThat(List.of(a.getResponse().getStatus(), b.getResponse().getStatus()))
          .containsExactlyInAnyOrder(200, 409);
      assertError(a.getResponse().getStatus() == 409 ? a : b, 409, "ANSWER_ALREADY_FINALIZED");
    }
    assertThat(learning.count("first_answers", student)).isEqualTo(1);
    assertThat(learning.count("last_answers", student)).isEqualTo(1);
    assertThat(learning.count("xp_entries", student)).isEqualTo(1);
    assertThat(attempts.findBySessionId(id))
        .get()
        .extracting(DayAttempt::getAnsweredCount)
        .isEqualTo(1);
  }

  @Test
  void clientAndExpiryShareOneLockedFinalizationPath() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var started = startDay(login, 1, UUID.randomUUID());
    var id = sessionId(started);
    var limit = deadline(node(started));
    clock.setInstant(limit);
    var barrier = new CyclicBarrier(2);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var clientAnswer =
          pool.submit(
              () -> {
                barrier.await(5, TimeUnit.SECONDS);
                return answer(login, id, UUID.randomUUID(), 1, AnswerChoice.O);
              });
      var expiry =
          pool.submit(
              () -> {
                barrier.await(5, TimeUnit.SECONDS);
                return new TransactionTemplate(transactions)
                    .execute(status -> expire(id, limit.plusNanos(1)));
              });
      var response = clientAnswer.get(10, TimeUnit.SECONDS);
      var workerResult = expiry.get(10, TimeUnit.SECONDS);
      if (response.getResponse().getStatus() == 200) {
        assertThat(node(response).path("outcome").asString()).isEqualTo("CORRECT");
        assertThat(workerResult).isEmpty();
        assertThat(node(session(login, id)).path("lastAnswer")).isEqualTo(node(response));
      } else {
        assertError(response, 409, "ANSWER_ALREADY_FINALIZED");
        assertThat(workerResult)
            .get()
            .satisfies(
                result -> {
                  assertThat(result.outcome()).isEqualTo(AnswerOutcome.TIMED_OUT);
                  assertThat(result.xpAwarded()).isEqualTo(375);
                });
        assertThat(node(session(login, id)).path("lastAnswer"))
            .isEqualTo(json.readTree(json.writeValueAsString(workerResult.orElseThrow())));
      }
    }
    var fact =
        firstAnswers
            .findByStudentAccountIdAndVersionAndQuestionId(student.getId(), "hanbit-v1", 1)
            .orElseThrow();
    var last =
        lastAnswers.findById(new LastAnswerId(student.getId(), "hanbit-v1", 1)).orElseThrow();
    assertThat(last.getSourceId()).isEqualTo(fact.getId());
    assertThat(last.getOutcome()).isEqualTo(fact.getOutcome());
    assertThat(last.getChoice()).isEqualTo(fact.getChoice());
    assertThat(
            jdbc.queryForObject(
                "select amount from xp_entries where source_id=?", Integer.class, fact.getId()))
        .isEqualTo(fact.isCorrect() ? 565 : 375);
    assertThat(learning.count("first_answers", student)).isEqualTo(1);
    assertThat(learning.count("last_answers", student)).isEqualTo(1);
    assertThat(learning.count("xp_entries", student)).isEqualTo(1);
  }

  @Test
  void snapshotInsertFailureRollsBackAnswerAndAdvanceAndTheSameRequestsCanRetry() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var principal = AuthenticationModule.principal(student);
    var login = client.loginStudent(student);
    var started = startDay(login, 1, UUID.randomUUID());
    var id = sessionId(started);
    var answerCommand = new SubmitAnswerCommand(UUID.randomUUID(), 1, AnswerChoice.O);
    var function = "task5_reject_snapshot_" + UUID.randomUUID().toString().replace("-", "");
    jdbc.execute(
        "create function "
            + function
            + "() returns trigger language plpgsql as $$"
            + " begin if NEW.student_account_id='"
            + student.getId()
            + "'::uuid"
            + " and NEW.operation <> 'START_SESSION' then"
            + " raise exception 'forced Task 5 snapshot conflict' using errcode='23505';"
            + " end if; return NEW; end; $$");
    try {
      jdbc.execute(
          "create trigger "
              + function
              + " before insert on idempotency_records"
              + " for each row execute function "
              + function
              + "()");
      try {
        assertThatThrownBy(() -> module.answer(principal, id, answerCommand))
            .hasStackTraceContaining("forced Task 5 snapshot conflict");
        assertThat(node(session(login, id))).isEqualTo(node(started));
        for (var table : List.of("first_answers", "last_answers", "xp_entries"))
          assertThat(learning.count(table, student)).as(table).isZero();
        assertThat(attempts.findBySessionId(id))
            .get()
            .satisfies(
                row -> {
                  assertThat(row.getAnsweredCount()).isZero();
                  assertThat(row.getCorrectCount()).isZero();
                  assertThat(row.getCurrentStreak()).isZero();
                });
      } finally {
        jdbc.execute("drop trigger " + function + " on idempotency_records");
      }
      var answered = module.answer(principal, id, answerCommand);
      assertThat(answered.xpAwarded()).isEqualTo(565);
      var waiting = node(session(login, id));
      var advanceCommand = new AdvanceLearningSessionCommand(UUID.randomUUID());
      jdbc.execute(
          "create trigger "
              + function
              + " before insert on idempotency_records"
              + " for each row execute function "
              + function
              + "()");
      try {
        assertThatThrownBy(() -> module.advance(principal, id, advanceCommand))
            .hasStackTraceContaining("forced Task 5 snapshot conflict");
        assertThat(node(session(login, id))).isEqualTo(waiting);
        assertThat(learning.count("first_answers", student)).isEqualTo(1);
        assertThat(learning.count("xp_entries", student)).isEqualTo(1);
      } finally {
        jdbc.execute("drop trigger " + function + " on idempotency_records");
      }
      var advanced = module.advance(principal, id, advanceCommand);
      assertThat(advanced.question().questionId()).isEqualTo(2);
      assertThat(advanced.lastAnswer()).isNull();
    } finally {
      jdbc.execute("drop function " + function + "()");
    }
  }

  @Test
  void contentVersionMismatchAndBrokenStudentContextFailBeforeMutating() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var request = UUID.randomUUID();
    var result = answer(login, id, request, 1, AnswerChoice.O);
    assertThat(result.getResponse().getStatus()).isEqualTo(200);
    try {
      jdbc.update("update content_versions set active=false where version='hanbit-v1'");
      jdbc.update(
          "insert into content_versions(version,digest,active) values ('task5-future',?,true)",
          "e".repeat(64));
      assertError(answer(login, id, request, 1, AnswerChoice.O), 409, "CONTENT_VERSION_MISMATCH");
      assertError(advance(login, id, UUID.randomUUID()), 409, "CONTENT_VERSION_MISMATCH");
    } finally {
      jdbc.update("delete from content_versions where version='task5-future'");
      jdbc.update("update content_versions set active=true where version='hanbit-v1'");
    }
    var principal = AuthenticationModule.principal(student);
    jdbc.update("delete from student_profiles where account_id=?", student.getId());
    assertThatThrownBy(() -> module.answer(principal, id, null))
        .isInstanceOfSatisfying(
            ApiException.class, error -> assertThat(error.status()).isEqualTo(401));
    assertThatThrownBy(() -> module.advance(principal, id, null))
        .isInstanceOfSatisfying(
            ApiException.class, error -> assertThat(error.status()).isEqualTo(401));
    assertThat(learning.count("first_answers", student)).isEqualTo(1);
    assertThat(learning.count("xp_entries", student)).isEqualTo(1);
    assertThat(learning.count("idempotency_records", student)).isEqualTo(2);
  }

  @Test
  void constraintAbortMapsAlreadyFinalizedOnlyAfterRollbackUsingFreshDatabaseState()
      throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var started = startDay(login, 1, UUID.randomUUID());
    var id = sessionId(started);
    var attempt = attempts.findBySessionId(id).orElseThrow();
    var existing = UUID.randomUUID();
    firstAnswers.saveAndFlush(
        new FirstAnswer(
            existing,
            student.getId(),
            "hanbit-v1",
            1,
            id,
            attempt.getId(),
            UUID.randomUUID(),
            AnswerChoice.X,
            false,
            false,
            clock.instant(),
            0));
    assertError(
        answer(login, id, UUID.randomUUID(), 1, AnswerChoice.O), 409, "ANSWER_ALREADY_FINALIZED");
    assertThat(firstAnswers.findById(existing))
        .get()
        .extracting(FirstAnswer::getChoice)
        .isEqualTo(AnswerChoice.X);
    assertThat(learning.count("xp_entries", student)).isZero();
    assertThat(learning.count("last_answers", student)).isZero();
    assertThat(node(session(login, id))).isEqualTo(node(started));
  }

  @Test
  void answerTransactionCommitsEvenWhenAnOuterCallerTransactionRollsBack() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    new TransactionTemplate(transactions)
        .execute(
            status -> {
              try {
                assertThat(answerCurrent(login, id, true).getResponse().getStatus()).isEqualTo(200);
              } catch (Exception error) {
                throw new IllegalStateException(error);
              }
              status.setRollbackOnly();
              return null;
            });
    assertThat(learning.count("first_answers", student)).isEqualTo(1);
    assertThat(learning.count("last_answers", student)).isEqualTo(1);
    assertThat(learning.count("xp_entries", student)).isEqualTo(1);
    assertThat(sessions.findById(id))
        .get()
        .extracting(LearningSession::getState)
        .isEqualTo(LearningSessionState.AWAITING_ADVANCE);
  }

  @Test
  void answerAndAdvanceRetainAuthenticationOwnershipAndValidationBoundaries() throws Exception {
    var owner = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(owner);
    var id = sessionId(startDay(login, 1, UUID.randomUUID()));
    var stranger = learning.student(LocalDate.of(2026, 10, 12));
    var strangerLogin = client.loginStudent(stranger);
    assertError(answer(strangerLogin, id, UUID.randomUUID(), 1, AnswerChoice.O), 404, "NOT_FOUND");
    assertError(advance(strangerLogin, id, UUID.randomUUID()), 404, "NOT_FOUND");
    var noCsrf =
        mvc.perform(
                post(answerPath(id))
                    .session(login)
                    .contentType("application/json")
                    .content(
                        "{\"requestId\":\""
                            + UUID.randomUUID()
                            + "\",\"questionId\":1,\"choice\":\"O\"}"))
            .andReturn();
    assertThat(noCsrf.getResponse().getStatus()).isEqualTo(403);
    for (var body :
        List.of(
            "{\"questionId\":1,\"choice\":\"O\"}",
            "{\"requestId\":\"" + UUID.randomUUID() + "\",\"questionId\":0,\"choice\":\"O\"}",
            "{\"requestId\":\"" + UUID.randomUUID() + "\",\"questionId\":151,\"choice\":\"O\"}",
            "{\"requestId\":\"" + UUID.randomUUID() + "\",\"questionId\":1}",
            "{\"requestId\":\"" + UUID.randomUUID() + "\",\"questionId\":1,\"choice\":\"Y\"}")) {
      assertError(raw(login, answerPath(id), body), 400, "VALIDATION_ERROR");
    }
    assertError(raw(login, advancePath(id), "{}"), 400, "VALIDATION_ERROR");
    var body =
        new java.util.HashMap<String, Object>(
            Map.of("requestId", UUID.randomUUID(), "questionId", 1, "choice", "O"));
    body.put("studentAccountId", stranger.getId());
    assertThat(send(answerPath(id), login, body).getResponse().getStatus()).isEqualTo(200);
    assertThat(learning.count("first_answers", owner)).isEqualTo(1);
    assertThat(learning.count("first_answers", stranger)).isZero();
    var staff = fixtures.teacher(fixtures.school("Task 5 staff"));
    var staffLogin = client.loginStaff(staff);
    assertThat(
            answer(staffLogin, id, UUID.randomUUID(), 1, AnswerChoice.O).getResponse().getStatus())
        .isEqualTo(403);
    assertThat(advance(staffLogin, id, UUID.randomUUID()).getResponse().getStatus()).isEqualTo(403);
    assertThatThrownBy(() -> module.answer(AuthenticationModule.principal(staff), id, null))
        .isInstanceOfSatisfying(
            ApiException.class, error -> assertThat(error.status()).isEqualTo(403));
    assertThatThrownBy(() -> module.answer(null, id, null))
        .isInstanceOfSatisfying(
            ApiException.class, error -> assertThat(error.status()).isEqualTo(401));
  }

  private tools.jackson.databind.JsonNode nodeUnchecked(
      org.springframework.test.web.servlet.MvcResult response) {
    try {
      return node(response);
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }

  private Optional<AnswerResult> expire(UUID id, Instant observedAt) {
    return finalizer.finalizeExpired(id, observedAt);
  }
}
