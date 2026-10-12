package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import kr.hanbit.school.content.AnswerChoice;
import kr.hanbit.school.support.LearningAnswerTestSupport;
import kr.hanbit.school.support.LearningRaceHarness;
import kr.hanbit.school.support.LearningTestClockConfiguration;
import kr.hanbit.school.support.PostgresTestConfiguration;
import kr.hanbit.school.support.SessionTestClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({
  PostgresTestConfiguration.class,
  LearningTestClockConfiguration.class,
  SessionTestClient.class
})
class LearningConcurrencyIT extends LearningAnswerTestSupport {
  @Autowired ApplicationContext context;
  @Autowired DataSource dataSource;
  @Autowired EntityManager entities;
  @Autowired PlatformTransactionManager transactions;
  @Autowired LearningSessionRepository sessions;
  @Autowired ExpiredLearningSessionProcessor processor;
  @Autowired LearningAnswerFinalizer finalizer;
  LearningRaceHarness race;

  @BeforeEach
  void prepareHarness() {
    race = new LearningRaceHarness(dataSource, jdbc, entities, transactions);
  }

  @Test
  void testProcessDisablesTheScheduledBeanWhileKeepingTheProcessorAvailable() {
    assertThat(context.containsBean("expiredLearningSessionScheduler")).isFalse();
    assertThat(context.containsBean("expiredLearningSessionProcessor")).isTrue();
  }

  @Test
  void twoWorkersUseOneStableTimeoutRequestAndOneFinalization() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var a = client.loginStudent(student);
    var started = startDay(a, 1, UUID.randomUUID());
    var id = sessionId(started);
    var deadline = deadline(node(started));
    var observed = deadline.plusNanos(1);
    race.<Object>raceSession(
        id,
        () -> {
          expire(id, observed);
          return null;
        },
        () -> {
          expire(id, observed);
          return null;
        });
    var fact = consistentFact(student.getId(), id, 1, true);
    assertThat(fact.get("choice")).isNull();
    assertThat(fact.get("request_id")).isEqualTo(ExpiryRequestId.forQuestion(id, 1, deadline));
    assertThat(count("idempotency_records", student.getId())).isEqualTo(2);
  }

  @Test
  void sameRequestRetryAcrossDevicesReturnsTheExactSnapshot() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var a = client.loginStudent(student);
    var b = client.loginStudent(student);
    assertThat(a.getId()).isNotEqualTo(b.getId());
    var id = sessionId(startDay(a, 1, UUID.randomUUID()));
    var request = UUID.randomUUID();
    var results =
        race.raceSession(
            id,
            () -> answer(a, id, request, 1, AnswerChoice.O),
            () -> answer(b, id, request, 1, AnswerChoice.O));
    assertThat(results).allSatisfy(r -> assertThat(r.getResponse().getStatus()).isEqualTo(200));
    assertThat(node(results.get(0))).isEqualTo(node(results.get(1)));
    var fact = consistentFact(student.getId(), id, 1, true);
    assertThat(fact.get("request_id")).isEqualTo(request);
    assertThat(fact.get("choice")).isEqualTo("O");
    assertThat(count("idempotency_records", student.getId())).isEqualTo(2);
  }

  @Test
  void differentRequestsForOneQuestionPersistOnlyTheWinningChoice() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var a = client.loginStudent(student);
    var b = client.loginStudent(student);
    var id = sessionId(startDay(a, 1, UUID.randomUUID()));
    var results =
        race.raceSession(
            id,
            () -> answer(a, id, UUID.randomUUID(), 1, AnswerChoice.O),
            () -> answer(b, id, UUID.randomUUID(), 1, AnswerChoice.X));
    assertThat(results)
        .extracting(r -> r.getResponse().getStatus())
        .containsExactlyInAnyOrder(200, 409);
    for (var result : results)
      if (result.getResponse().getStatus() == 409)
        assertError(result, 409, "ANSWER_ALREADY_FINALIZED");
    var fact = consistentFact(student.getId(), id, 1, true);
    var feedback = feedback(id);
    assertThat(fact.get("id").toString()).isEqualTo(feedback.path("attemptAnswerId").asString());
    assertThat(count("idempotency_records", student.getId())).isEqualTo(2);
  }

  @Test
  void twoDevicesStartingTogetherCreateOneSessionAndOneAttempt() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var a = client.loginStudent(student);
    var b = client.loginStudent(student);
    var results =
        race.raceStudent(
            student.getId(),
            () -> startDay(a, 1, UUID.randomUUID()),
            () -> startDay(b, 1, UUID.randomUUID()));
    assertThat(node(results.get(0))).isEqualTo(node(results.get(1)));
    for (var table : List.of("learning_sessions", "day_attempts", "day_progress"))
      assertThat(count(table, student.getId())).as(table).isEqualTo(1);
    assertThat(count("idempotency_records", student.getId())).isEqualTo(2);
    assertThat(
            race.fresh(
                () ->
                    jdbc.queryForObject(
                        "select count(*) from learning_session_questions where session_id=?",
                        Integer.class,
                        sessionIdUnchecked(results.get(0)))))
        .isEqualTo(5);
  }

  @Test
  void fifthAnswerContentionCommitsCompletionAndPassXpOnce() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var a = client.loginStudent(student);
    var b = client.loginStudent(student);
    var id = sessionId(startDay(a, 1, UUID.randomUUID()));
    complete(a, id, true, true, true, true);
    advanceOk(a, id);
    var results =
        race.raceSession(
            id,
            () -> answer(a, id, UUID.randomUUID(), 5, choice(5, true)),
            () -> answer(b, id, UUID.randomUUID(), 5, choice(5, false)));
    assertThat(results)
        .extracting(r -> r.getResponse().getStatus())
        .containsExactlyInAnyOrder(200, 409);
    consistentFact(student.getId(), id, 5, true);
    assertFifthCompleted(student.getId(), id);
  }

  @Test
  void answerAndExpiryFinalizeExactlyOnce() throws Exception {
    assertThat(context.containsBean("expiredLearningSessionProcessor")).isTrue();
    // Repeated races with one timely HTTP request and one overdue worker observation.
    for (int iteration = 0; iteration < 5; iteration++) {
      var student = learning.student(LocalDate.of(2026, 10, 12));
      var a = client.loginStudent(student);
      var b = client.loginStudent(student);
      var started = startDay(a, 1, UUID.randomUUID());
      var id = sessionId(started);
      var deadline = deadline(node(started));
      clock.setInstant(deadline);
      var request = UUID.randomUUID();
      var results =
          race.<Object>raceSession(
              id,
              () -> answer(a, id, request, 1, AnswerChoice.O),
              () -> {
                expire(id, deadline.plusNanos(1));
                return null;
              });
      var fact = consistentFact(student.getId(), id, 1, true);
      assertThat(fact.get("choice")).isIn("O", (String) null);
      var response = (MvcResult) results.get(0);
      if (fact.get("choice") == null) {
        assertError(response, 409, "ANSWER_ALREADY_FINALIZED");
        assertThat(fact.get("request_id")).isEqualTo(ExpiryRequestId.forQuestion(id, 1, deadline));
      } else {
        assertThat(response.getResponse().getStatus()).isEqualTo(200);
        assertThat(fact.get("request_id")).isEqualTo(request);
        assertThat(node(answer(b, id, request, 1, AnswerChoice.O))).isEqualTo(node(response));
      }
      var before = allFacts(student.getId(), id);
      expire(id, deadline.plusSeconds(1));
      assertThat(allFacts(student.getId(), id)).isEqualTo(before);
      assertThat(count("review_masteries", student.getId())).isZero();
      assertThat(count("review_queue_entries", student.getId()))
          .isEqualTo(fact.get("choice") == null ? 1 : 0);
    }
  }

  @ParameterizedTest
  @EnumSource(
      value = LearningMode.class,
      names = {"REPLAY", "REVIEW"})
  void repeatAnswerAndExpiryNeverMixFirstRepeatMasteryQueueOrPassFacts(LearningMode mode)
      throws Exception {
    assertThat(context.containsBean("expiredLearningSessionProcessor")).isTrue();
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var a = client.loginStudent(student);
    var b = client.loginStudent(student);
    var first = sessionId(startDay(a, 1, UUID.randomUUID()));
    complete(a, first, false, false, false, false, false);
    var firstFacts =
        race.fresh(
            () ->
                jdbc.queryForList(
                    "select * from first_answers where student_account_id=? order by question_id",
                    student.getId()));
    var body =
        mode == LearningMode.REPLAY
            ? Map.<String, Object>of(
                "mode",
                mode,
                "dayNumber",
                1,
                "questionIds",
                List.of(),
                "requestId",
                UUID.randomUUID())
            : Map.<String, Object>of(
                "mode", mode, "questionIds", List.of(1), "requestId", UUID.randomUUID());
    var started = send("/api/student/learning/sessions", a, body);
    assertThat(started.getResponse().getStatus()).isEqualTo(200);
    var id = sessionId(started);
    var deadline = deadline(node(started));
    clock.setInstant(deadline);
    var request = UUID.randomUUID();
    var results =
        race.<Object>raceSession(
            id,
            () -> answer(b, id, request, 1, AnswerChoice.O),
            () -> {
              expire(id, deadline.plusNanos(1));
              return null;
            });
    var fact = consistentFact(student.getId(), id, 1, false);
    var timedOut = (boolean) fact.get("timed_out");
    if (timedOut) assertError((MvcResult) results.get(0), 409, "ANSWER_ALREADY_FINALIZED");
    else assertThat(((MvcResult) results.get(0)).getResponse().getStatus()).isEqualTo(200);
    assertThat(
            race.fresh(
                () ->
                    jdbc.queryForList(
                        "select * from first_answers where student_account_id=? order by"
                            + " question_id",
                        student.getId())))
        .isEqualTo(firstFacts);
    assertThat(count("review_masteries", student.getId())).isEqualTo(timedOut ? 0 : 1);
    assertThat(
            race.fresh(
                () ->
                    jdbc.queryForObject(
                        "select active from review_queue_entries where student_account_id=? and"
                            + " question_id=1",
                        Boolean.class,
                        student.getId())))
        .isEqualTo(timedOut);
    assertThat(passCount(student.getId())).isZero();
    assertThat(count("day_attempts", student.getId()))
        .isEqualTo(mode == LearningMode.REPLAY ? 2 : 1);
  }

  @Test
  void fifthAnswerAgainstExpiryFinishesOneCoherentAttempt() throws Exception {
    assertThat(context.containsBean("expiredLearningSessionProcessor")).isTrue();
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var a = client.loginStudent(student);
    var started = startDay(a, 1, UUID.randomUUID());
    var id = sessionId(started);
    complete(a, id, true, true, true, true);
    var fifth = advanceOk(a, id);
    var deadline = deadline(node(fifth));
    clock.setInstant(deadline);
    race.<Object>raceSession(
        id,
        () -> answer(a, id, UUID.randomUUID(), 5, choice(5, true)),
        () -> {
          expire(id, deadline.plusNanos(1));
          return null;
        });
    consistentFact(student.getId(), id, 5, true);
    assertFifthCompleted(student.getId(), id);
  }

  @Test
  void expiryOwnsNewTransactionEvenWhenAnOuterTransactionRollsBack() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var a = client.loginStudent(student);
    var started = startDay(a, 1, UUID.randomUUID());
    var id = sessionId(started);
    new TransactionTemplate(transactions)
        .executeWithoutResult(
            status -> {
              expire(id, deadlineUnchecked(started).plusNanos(1));
              status.setRollbackOnly();
            });
    consistentFact(student.getId(), id, 1, true);
    assertThat(feedback(id).path("outcome").asString()).isEqualTo("TIMED_OUT");
  }

  @Test
  void scanIsStrictBoundedAndOrderedAndExcludesFeedbackAndCompletedSessions() throws Exception {
    var due = Instant.parse("2026-10-12T00:00:02.123456Z");
    var ids = new java.util.ArrayList<UUID>();
    for (int index = 0; index < 5; index++) {
      var student = learning.student(LocalDate.of(2026, 10, 12));
      var id = sessionId(startDay(client.loginStudent(student), 1, UUID.randomUUID()));
      ids.add(id);
      jdbc.update("update learning_sessions set deadline_at=? where id=?", Timestamp.from(due), id);
    }
    jdbc.update("update learning_sessions set state='AWAITING_ADVANCE' where id=?", ids.get(3));
    jdbc.update("update learning_sessions set state='COMPLETED' where id=?", ids.get(4));
    assertThat(race.fresh(() -> sessions.findExpiredIds(due, PageRequest.of(0, 100)))).isEmpty();
    var expected =
        race.fresh(
            () ->
                jdbc.queryForList(
                    "select id from learning_sessions where state='QUESTION_ACTIVE' and"
                        + " deadline_at=? order by id",
                    UUID.class,
                    Timestamp.from(due)));
    assertThat(race.fresh(() -> sessions.findExpiredIds(due.plusNanos(1), PageRequest.of(0, 2))))
        .containsExactlyElementsOf(expected.subList(0, 2));
    for (int nanos : List.of(499, 500, 999, 1000))
      assertThat(
              race.fresh(() -> sessions.findExpiredIds(due.plusNanos(nanos), PageRequest.of(0, 2))))
          .containsExactlyElementsOf(expected.subList(0, 2));
    assertThat(
            race.fresh(() -> sessions.findExpiredIds(due.plusSeconds(1), PageRequest.of(0, 100))))
        .containsExactlyElementsOf(expected);
    var earlier = due.minusSeconds(1);
    jdbc.update(
        "update learning_sessions set deadline_at=? where id=?",
        Timestamp.from(earlier),
        expected.getLast());
    assertThat(race.fresh(() -> sessions.findExpiredIds(due.plusSeconds(1), PageRequest.of(0, 2))))
        .containsExactly(expected.getLast(), expected.getFirst());
  }

  @Test
  void equalityAndStaleCandidatesAreNoOpsAndSyntheticIdUsesTheLockedPersistedQuestion()
      throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var a = client.loginStudent(student);
    var started = startDay(a, 1, UUID.randomUUID());
    var id = sessionId(started);
    var deadline = deadline(node(started));
    java.util.Optional<AnswerResult> equalResult =
        new TransactionTemplate(transactions)
            .execute(status -> finalizer.finalizeExpired(id, deadline));
    assertThat(equalResult).isEmpty();
    expire(id, deadline);
    assertThat(count("first_answers", student.getId())).isZero();
    answerCurrent(a, id, true);
    expire(id, deadline.plusSeconds(1));
    assertThat(count("first_answers", student.getId())).isEqualTo(1);
    clock.setInstant(deadline.plusSeconds(1));
    var next = advanceOk(a, id);
    var nextDeadline = deadline(node(next));
    expire(id, deadline.plusNanos(1));
    assertThat(count("first_answers", student.getId())).isEqualTo(1);
    expire(id, nextDeadline.plusNanos(1));
    var fact = consistentFact(student.getId(), id, 2, true);
    assertThat(fact.get("request_id")).isEqualTo(ExpiryRequestId.forQuestion(id, 2, nextDeadline));
  }

  @Test
  void constraintAbortRollsBackFullyAndRecoveryReadsAfterRollback() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var a = client.loginStudent(student);
    var started = startDay(a, 1, UUID.randomUUID());
    var id = sessionId(started);
    var deadline = deadline(node(started));
    var synthetic = ExpiryRequestId.forQuestion(id, 1, deadline);
    learning.idempotency(student, "SUBMIT_ANSWER", synthetic, "a".repeat(64), "{}");
    var before = allFacts(student.getId(), id);
    assertThatThrownBy(() -> expire(id, deadline.plusNanos(1)))
        .satisfies(
            failure -> {
              Throwable cause = failure;
              while (cause.getCause() != null
                  && !(cause instanceof org.hibernate.exception.ConstraintViolationException))
                cause = cause.getCause();
              assertThat(cause)
                  .isInstanceOfSatisfying(
                      org.hibernate.exception.ConstraintViolationException.class,
                      violation -> {
                        assertThat(violation.getSQLState()).isEqualTo("23505");
                        assertThat(violation.getConstraintName())
                            .isEqualTo("idempotency_records_pkey");
                      });
            });
    assertThat(allFacts(student.getId(), id)).isEqualTo(before);
    jdbc.update(
        "delete from idempotency_records where student_account_id=? and operation='SUBMIT_ANSWER'"
            + " and request_id=?",
        student.getId(),
        synthetic);
    expire(id, deadline.plusNanos(1));
    consistentFact(student.getId(), id, 1, true);
  }

  @Test
  void constraintRecoveryUsesADistinctNewReadTransactionOnlyAfterTheWriteRolledBack()
      throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var a = client.loginStudent(student);
    var started = startDay(a, 1, UUID.randomUUID());
    var id = sessionId(started);
    var deadline = deadline(node(started));
    var request = ExpiryRequestId.forQuestion(id, 1, deadline);
    learning.idempotency(student, "SUBMIT_ANSWER", request, "a".repeat(64), "{}");
    var before = allFacts(student.getId(), id);
    var observer = new ObservedTransactions(transactions);
    var isolated = new ExpiredLearningSessionProcessor(finalizer, sessions, observer);
    new TransactionTemplate(transactions)
        .executeWithoutResult(
            status -> {
              var outerId = jdbc.queryForObject("select txid_current()", Long.class);
              assertThatThrownBy(() -> isolated.expireOne(id, deadline.plusNanos(1)))
                  .isInstanceOf(org.hibernate.exception.ConstraintViolationException.class);
              assertThat(observer.ids).hasSize(2).doesNotHaveDuplicates().doesNotContain(outerId);
              assertThat(observer.events)
                  .containsExactly("new-write", "rollback", "new-read", "commit");
              assertThat(jdbc.queryForObject("select txid_current()", Long.class))
                  .isEqualTo(outerId);
              status.setRollbackOnly();
            });
    assertThat(allFacts(student.getId(), id)).isEqualTo(before);
  }

  @Test
  void constraintRecoveryToleratesAClientWinnerCommittedAfterTheWorkerRollback() throws Exception {
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var a = client.loginStudent(student);
    var started = startDay(a, 1, UUID.randomUUID());
    var id = sessionId(started);
    var deadline = deadline(node(started));
    var synthetic = ExpiryRequestId.forQuestion(id, 1, deadline);
    learning.idempotency(student, "SUBMIT_ANSWER", synthetic, "a".repeat(64), "{}");
    var rolledBack = new CountDownLatch(1);
    var recover = new CountDownLatch(1);
    var observer = new ObservedTransactions(transactions);
    observer.afterRollback =
        () -> {
          rolledBack.countDown();
          try {
            assertThat(recover.await(5, TimeUnit.SECONDS)).isTrue();
          } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw new AssertionError(failure);
          }
        };
    var isolated = new ExpiredLearningSessionProcessor(finalizer, sessions, observer);
    try (var pool = Executors.newSingleThreadExecutor()) {
      var worker = pool.submit(() -> isolated.expireOne(id, deadline.plusNanos(1)));
      try {
        assertThat(rolledBack.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(count("first_answers", student.getId())).isZero();
        var answer = answer(a, id, UUID.randomUUID(), 1, AnswerChoice.O);
        assertThat(answer.getResponse().getStatus()).isEqualTo(200);
        var beforeRecovery = allFacts(student.getId(), id);
        recover.countDown();
        worker.get(10, TimeUnit.SECONDS);
        assertThat(allFacts(student.getId(), id)).isEqualTo(beforeRecovery);
        consistentFact(student.getId(), id, 1, true);
        assertThat(feedback(id)).isEqualTo(node(answer));
        assertThat(observer.events).containsExactly("new-write", "rollback", "new-read", "commit");
      } finally {
        recover.countDown();
      }
    }
  }

  /** Observe actual PostgreSQL transaction IDs while delegating all transaction work unchanged. */
  private final class ObservedTransactions implements PlatformTransactionManager {
    private final PlatformTransactionManager delegate;
    final List<Long> ids = new java.util.ArrayList<>();
    final List<String> events = new java.util.ArrayList<>();
    Runnable afterRollback = () -> {};

    ObservedTransactions(PlatformTransactionManager delegate) {
      this.delegate = delegate;
    }

    @Override
    public TransactionStatus getTransaction(TransactionDefinition definition) {
      var status = delegate.getTransaction(definition);
      ids.add(jdbc.queryForObject("select txid_current()", Long.class));
      events.add(
          (status.isNewTransaction() ? "new-" : "joined-")
              + (definition.isReadOnly() ? "read" : "write"));
      return status;
    }

    @Override
    public void commit(TransactionStatus status) {
      delegate.commit(status);
      events.add("commit");
    }

    @Override
    public void rollback(TransactionStatus status) {
      delegate.rollback(status);
      events.add("rollback");
      afterRollback.run();
    }
  }

  @Test
  void oneTickHonorsItsBatchBoundAndKeepsTheDeterministicDeadlineOrder() throws Exception {
    assertThat(context.containsBean("expiredLearningSessionProcessor")).isTrue();
    var due = Instant.parse("2026-10-11T00:00:00Z");
    var ids = new java.util.ArrayList<UUID>();
    for (int index = 0; index < 5; index++) {
      var student = learning.student(LocalDate.of(2026, 10, 12));
      var id = sessionId(startDay(client.loginStudent(student), 1, UUID.randomUUID()));
      ids.add(id);
      jdbc.update(
          "update learning_sessions set deadline_at=? where id=?",
          Timestamp.from(due.plusSeconds(index)),
          id);
    }
    try {
      tick(2);
      for (int index = 0; index < 5; index++) {
        final var id = ids.get(index);
        assertThat(
                race.fresh(
                    () ->
                        jdbc.queryForObject(
                            "select count(*) from first_answers where session_id=?",
                            Integer.class,
                            id)))
            .isEqualTo(index < 2 ? 1 : 0);
      }
    } finally {
      for (var id : ids)
        jdbc.update(
            "update learning_sessions set deadline_at=? where id=?",
            Timestamp.from(clock.instant().plusSeconds(60)),
            id);
    }
  }

  @Test
  void aFailedSessionRollsBackAndDoesNotPreventTheNextSessionInTheBatch() throws Exception {
    assertThat(context.containsBean("expiredLearningSessionProcessor")).isTrue();
    var due = Instant.parse("2026-10-11T01:00:00Z");
    var failedStudent = learning.student(LocalDate.of(2026, 10, 12));
    var nextStudent = learning.student(LocalDate.of(2026, 10, 12));
    var failed = sessionId(startDay(client.loginStudent(failedStudent), 1, UUID.randomUUID()));
    var next = sessionId(startDay(client.loginStudent(nextStudent), 1, UUID.randomUUID()));
    jdbc.update(
        "update learning_sessions set deadline_at=? where id=?", Timestamp.from(due), failed);
    jdbc.update(
        "update learning_sessions set deadline_at=? where id=?",
        Timestamp.from(due.plusSeconds(1)),
        next);
    var request = ExpiryRequestId.forQuestion(failed, 1, due);
    learning.idempotency(failedStudent, "SUBMIT_ANSWER", request, "a".repeat(64), "{}");
    var before = allFacts(failedStudent.getId(), failed);
    try {
      tick(2);
      assertThat(allFacts(failedStudent.getId(), failed)).isEqualTo(before);
      assertThat(count("first_answers", nextStudent.getId())).isEqualTo(1);
      consistentFact(nextStudent.getId(), next, 1, true);
      jdbc.update(
          "delete from idempotency_records where student_account_id=? and operation='SUBMIT_ANSWER'"
              + " and request_id=?",
          failedStudent.getId(),
          request);
      tick(2);
      consistentFact(failedStudent.getId(), failed, 1, true);
    } finally {
      jdbc.update(
          "update learning_sessions set deadline_at=? where id=?",
          Timestamp.from(clock.instant().plusSeconds(60)),
          failed);
    }
  }

  private void tick(int batch) {
    new ExpiredLearningSessionScheduler(sessions, processor, clock, batch).expireDueSessions();
  }

  private void expire(UUID id, Instant observedAt) {
    processor.expireOne(id, observedAt);
  }

  private int count(String table, UUID student) {
    return race.fresh(
        () ->
            jdbc.queryForObject(
                "select count(*) from " + table + " where student_account_id=?",
                Integer.class,
                student));
  }

  private int passCount(UUID student) {
    return race.fresh(
        () ->
            jdbc.queryForObject(
                "select count(*) from xp_entries where student_account_id=? and"
                    + " kind='FIRST_DAY_PASS'",
                Integer.class,
                student));
  }

  private tools.jackson.databind.JsonNode feedback(UUID session) {
    return race.fresh(
        () ->
            json.readTree(
                jdbc.queryForObject(
                    "select last_result_json::text from learning_sessions where id=?",
                    String.class,
                    session)));
  }

  private UUID sessionIdUnchecked(MvcResult result) {
    try {
      return sessionId(result);
    } catch (Exception e) {
      throw new AssertionError(e);
    }
  }

  private Instant deadlineUnchecked(MvcResult result) {
    try {
      return deadline(node(result));
    } catch (Exception e) {
      throw new AssertionError(e);
    }
  }

  private Map<String, Object> consistentFact(
      UUID student, UUID session, int question, boolean first) {
    return race.fresh(
        () -> {
          var facts =
              jdbc.queryForList(
                  "select * from "
                      + (first ? "first_answers" : "review_attempts")
                      + " where session_id=? and question_id=?",
                  session,
                  question);
          assertThat(facts).hasSize(1);
          var fact = facts.getFirst();
          var projection =
              jdbc.queryForList(
                  "select * from last_answers where student_account_id=? and version='hanbit-v1'"
                      + " and question_id=?",
                  student,
                  question);
          assertThat(projection).hasSize(1);
          var last = projection.getFirst();
          assertThat(last.get("source_id")).isEqualTo(fact.get("id"));
          assertThat(last.get("source_type")).isEqualTo(first ? "FIRST" : "REPEAT");
          for (var field : List.of("choice", "timed_out", "correct", "answered_at"))
            assertThat(last.get(field)).as(field).isEqualTo(fact.get(field));
          var outcome =
              (boolean) fact.get("timed_out")
                  ? "TIMED_OUT"
                  : (boolean) fact.get("correct") ? "CORRECT" : "WRONG";
          assertThat(last.get("outcome")).isEqualTo(outcome);
          assertThat(fact.get("request_id")).isNotNull();
          var entries =
              jdbc.queryForList("select * from xp_entries where source_id=?", fact.get("id"));
          assertThat(entries).hasSize(1);
          assertThat(entries.getFirst().get("kind"))
              .isEqualTo(first ? "FIRST_ANSWER" : "REPEAT_ANSWER");
          assertThat(entries.getFirst().get("rule_version")).isEqualTo("learning-v1");
          if (!first || question == 1)
            assertThat(entries.getFirst().get("amount"))
                .isEqualTo(first ? ((boolean) fact.get("correct") ? 565 : 375) : 1);
          var saved = feedback(session);
          assertThat(saved.path("attemptAnswerId").asString()).isEqualTo(fact.get("id").toString());
          assertThat(saved.path("outcome").asString()).isEqualTo(outcome);
          assertThat(saved.path("totalXp").asLong())
              .isEqualTo(
                  jdbc.queryForObject(
                      "select sum(amount) from xp_entries where student_account_id=?",
                      Long.class,
                      student));
          assertThat(passCount(student)).isLessThanOrEqualTo(1);
          return fact;
        });
  }

  private Map<String, Object> allFacts(UUID student, UUID session) {
    return race.fresh(
        () ->
            Map.of(
                "session",
                jdbc.queryForMap("select * from learning_sessions where id=?", session),
                "first",
                jdbc.queryForList(
                    "select * from first_answers where student_account_id=? order by question_id",
                    student),
                "repeat",
                jdbc.queryForList(
                    "select * from review_attempts where student_account_id=? order by id",
                    student),
                "last",
                jdbc.queryForList(
                    "select * from last_answers where student_account_id=? order by question_id",
                    student),
                "xp",
                jdbc.queryForList(
                    "select * from xp_entries where student_account_id=? order by id", student),
                "queue",
                jdbc.queryForList(
                    "select * from review_queue_entries where student_account_id=? order by"
                        + " question_id",
                    student),
                "mastery",
                jdbc.queryForList(
                    "select * from review_masteries where student_account_id=? order by"
                        + " question_id",
                    student),
                "attempt",
                jdbc.queryForList(
                    "select * from day_attempts where student_account_id=? order by id", student),
                "progress",
                jdbc.queryForList(
                    "select * from day_progress where student_account_id=? order by id", student),
                "requests",
                jdbc.queryForList(
                    "select * from idempotency_records where student_account_id=? order by"
                        + " operation,request_id",
                    student)));
  }

  private void assertFifthCompleted(UUID student, UUID session) {
    race.fresh(
        () -> {
          var attempt = jdbc.queryForMap("select * from day_attempts where session_id=?", session);
          assertThat(attempt.get("answered_count")).isEqualTo(5);
          int correct =
              jdbc.queryForObject(
                  "select count(*) from first_answers where session_id=? and correct",
                  Integer.class,
                  session);
          assertThat(attempt.get("correct_count")).isEqualTo(correct);
          assertThat(attempt.get("state")).isEqualTo("PASSED");
          assertThat(attempt.get("finished_at")).isNotNull();
          assertThat(
                  jdbc.queryForObject(
                      "select state from learning_sessions where id=?", String.class, session))
              .isEqualTo("COMPLETED");
          var day =
              jdbc.queryForMap(
                  "select * from day_progress where student_account_id=? and day=1", student);
          assertThat(day.get("state")).isEqualTo("PASSED");
          assertThat(day.get("passed_at")).isEqualTo(attempt.get("finished_at"));
          assertThat(passCount(student)).isEqualTo(1);
          assertThat(
                  jdbc.queryForObject(
                      "select source_id from xp_entries where student_account_id=? and"
                          + " kind='FIRST_DAY_PASS'",
                      UUID.class,
                      student))
              .isEqualTo(day.get("id"));
          assertThat(
                  jdbc.queryForObject(
                      "select amount from xp_entries where student_account_id=? and"
                          + " kind='FIRST_DAY_PASS'",
                      Integer.class,
                      student))
              .isEqualTo(1125);
          assertThat(feedback(session).path("attemptCorrectCount").asInt()).isEqualTo(correct);
          assertThat(feedback(session).path("xpAwarded").asInt())
              .isEqualTo(correct == 5 ? 2440 : 1500);
          return true;
        });
  }
}
