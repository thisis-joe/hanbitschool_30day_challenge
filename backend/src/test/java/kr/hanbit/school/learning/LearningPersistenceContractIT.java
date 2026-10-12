package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.persistence.EntityManager;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import kr.hanbit.school.account.AuthenticationModule;
import kr.hanbit.school.content.AnswerChoice;
import kr.hanbit.school.learning.xp.XpEntry;
import kr.hanbit.school.learning.xp.XpEntryRepository;
import kr.hanbit.school.learning.xp.XpKind;
import kr.hanbit.school.shared.web.ApiException;
import kr.hanbit.school.support.LearningTestClockConfiguration;
import kr.hanbit.school.support.MutableClock;
import kr.hanbit.school.support.PostgresTestConfiguration;
import kr.hanbit.school.support.TestFixtures;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@Import({PostgresTestConfiguration.class, LearningTestClockConfiguration.class})
@Transactional
class LearningPersistenceContractIT {
  private static final String VERSION = "hanbit-v1";

  @Autowired JdbcTemplate jdbc;
  @Autowired TestFixtures fixtures;
  @Autowired MutableClock clock;
  @Autowired EntityManager entityManager;
  @Autowired LearningSessionRepository sessions;
  @Autowired DayAttemptRepository attempts;
  @Autowired IdempotencyRecordRepository idempotencyRecords;
  @Autowired FirstAnswerRepository firstAnswers;
  @Autowired ReviewAttemptRepository reviewAttempts;
  @Autowired ReviewMasteryRepository masteries;
  @Autowired ReviewQueueEntryRepository reviewQueue;
  @Autowired LastAnswerRepository lastAnswers;
  @Autowired XpEntryRepository xpEntries;
  @Autowired StudentLearningAccess access;

  @BeforeEach
  void setTime() {
    clock.setInstant(Instant.parse("2026-10-12T00:00:00.123456789Z"));
  }

  @Test
  void v3TablesExist() {
    for (String table :
        new String[] {
          "day_progress",
          "learning_sessions",
          "learning_session_questions",
          "day_attempts",
          "idempotency_records"
        }) {
      assertThat(jdbc.queryForObject("select to_regclass(?)::text", String.class, table))
          .as(table)
          .isNotNull();
    }
  }

  @Test
  void v4TablesExist() {
    for (String table : new String[] {"first_answers", "last_answers", "xp_entries"}) {
      assertThat(jdbc.queryForObject("select to_regclass(?)::text", String.class, table))
          .as(table)
          .isNotNull();
    }
  }

  @Test
  void firstAnswerIdentityIsImmutableAndUniquePerStudentVersionAndQuestion() {
    var context = answerContext(1);
    firstAnswers.saveAndFlush(
        new FirstAnswer(
            UUID.randomUUID(),
            context.student(),
            VERSION,
            1,
            context.session(),
            context.attempt(),
            UUID.randomUUID(),
            AnswerChoice.O,
            false,
            true,
            clock.instant(),
            1_250));

    assertThatThrownBy(
            () ->
                firstAnswers.saveAndFlush(
                    new FirstAnswer(
                        UUID.randomUUID(),
                        context.student(),
                        VERSION,
                        1,
                        context.session(),
                        context.attempt(),
                        UUID.randomUUID(),
                        AnswerChoice.X,
                        false,
                        false,
                        clock.instant(),
                        1_500)))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void firstAnswerTimeoutRoundTripsAsANullChoiceAndDerivedTimedOutOutcome() {
    var context = answerContext(1);
    var answer =
        firstAnswers.saveAndFlush(
            new FirstAnswer(
                UUID.randomUUID(),
                context.student(),
                VERSION,
                1,
                context.session(),
                context.attempt(),
                UUID.randomUUID(),
                null,
                true,
                false,
                clock.instant(),
                10_000));
    entityManager.clear();

    var reloaded = firstAnswers.findById(answer.getId()).orElseThrow();
    assertThat(reloaded.getChoice()).isNull();
    assertThat(reloaded.isTimedOut()).isTrue();
    assertThat(reloaded.isCorrect()).isFalse();
    assertThat(reloaded.getOutcome()).isEqualTo(AnswerOutcome.TIMED_OUT);
  }

  @ParameterizedTest
  @CsvSource(value = {"O,false,true,CORRECT", "X,false,false,WRONG", "NULL,true,false,TIMED_OUT"},
      nullValues = "NULL")
  void firstAnswerRoundTripsDerivedOutcomesAndLongResponseDuration(
      AnswerChoice choice, boolean timedOut, boolean correct, AnswerOutcome outcome) {
    var context = answerContext(1);
    var answer = firstAnswers.saveAndFlush(
        new FirstAnswer(UUID.randomUUID(), context.student(), VERSION, 1, context.session(),
            context.attempt(), UUID.randomUUID(), choice, timedOut, correct,
            clock.instant(), 3_000_000_000L));
    entityManager.clear();

    var reloaded = firstAnswers.findById(answer.getId()).orElseThrow();
    assertThat(reloaded.getChoice()).isEqualTo(choice);
    assertThat(reloaded.isTimedOut()).isEqualTo(timedOut);
    assertThat(reloaded.isCorrect()).isEqualTo(correct);
    assertThat(reloaded.getOutcome()).isEqualTo(outcome);
    assertThat(reloaded.getResponseMillis()).isEqualTo(3_000_000_000L);
    assertThat(reloaded.getAnsweredAt())
        .isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
  }

  @Test
  void mergingAReplacementCannotRewriteTheFirstAnswerFact() {
    var context = answerContext(1);
    var id = UUID.randomUUID();
    var request = UUID.randomUUID();
    firstAnswers.saveAndFlush(new FirstAnswer(id, context.student(), VERSION, 1,
        context.session(), context.attempt(), request, AnswerChoice.O, false, true,
        clock.instant(), 0));
    entityManager.clear();

    firstAnswers.saveAndFlush(new FirstAnswer(id, context.student(), VERSION, 2,
        context.session(), context.attempt(), UUID.randomUUID(), null, true, false,
        clock.instant().plusSeconds(30), 30_000));
    entityManager.clear();

    var reloaded = firstAnswers.findById(id).orElseThrow();
    assertThat(reloaded.getQuestionId()).isEqualTo(1);
    assertThat(reloaded.getRequestId()).isEqualTo(request);
    assertThat(reloaded.getChoice()).isEqualTo(AnswerChoice.O);
    assertThat(reloaded.getOutcome()).isEqualTo(AnswerOutcome.CORRECT);
    assertThat(reloaded.getResponseMillis()).isZero();
    assertThat(reloaded.getAnsweredAt())
        .isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
    assertThat(firstAnswers.countByStudentAccountIdAndVersion(context.student(), VERSION))
        .isEqualTo(1);
  }

  @ParameterizedTest
  @CsvSource(value = {
      "NULL,false,false", "NULL,false,true", "O,true,false", "X,true,false",
      "NULL,true,true", "O,true,true", "Y,false,false"
  }, nullValues = "NULL")
  void firstAnswersRejectInvalidChoiceTimeoutAndCorrectCombinations(
      String choice, boolean timedOut, boolean correct) {
    var context = answerContext(1);

    assertSqlViolation("23514", null,
        () -> insertFirstAnswer(context.student(), VERSION, 1, context.session(),
            context.attempt(), choice, timedOut, correct));
  }

  @ParameterizedTest
  @CsvSource(value = {"NULL,false", "false,NULL"}, nullValues = "NULL")
  void firstAnswersRejectNullOutcomeBooleans(Boolean timedOut, Boolean correct) {
    var context = answerContext(1);

    assertSqlViolation("23502", null,
        () -> insertFirstAnswer(context.student(), VERSION, 1, context.session(),
            context.attempt(), "O", timedOut, correct));
  }

  @Test
  void firstAnswersCannotClaimAnotherStudentsSessionAndAttempt() {
    var context = answerContext(1);
    var stranger = student(2);

    assertSqlViolation("23503", "first_answers_session_identity_fk",
        () -> insertFirstAnswer(stranger, VERSION, 1, context.session(),
            context.attempt(), "O", false, true));
  }

  @Test
  void firstAnswersCannotChangeTheOwningSessionsContentVersion() {
    var context = answerContext(1);
    var otherVersion = "answer-fk-" + UUID.randomUUID();
    insertContentVersion(otherVersion);

    assertSqlViolation("23503", "first_answers_session_identity_fk",
        () -> insertFirstAnswer(context.student(), otherVersion, 1, context.session(),
            context.attempt(), "O", false, true));
  }

  @Test
  void firstAnswersCannotUseAnAttemptFromAnotherSessionOfTheSameStudent() {
    var context = answerContext(1);
    var otherSession = UUID.randomUUID();
    insertSession(otherSession, context.student(), "COMPLETED", now());

    assertSqlViolation("23503", "first_answers_attempt_identity_fk",
        () -> insertFirstAnswer(context.student(), VERSION, 1, otherSession,
            context.attempt(), "O", false, true));
  }

  @ParameterizedTest
  @ValueSource(strings = {"student", "question", "session", "attempt"})
  void firstAnswersRejectMissingReferencedFacts(String missing) {
    var context = answerContext(1);

    assertSqlViolation("23503", null,
        () -> insertFirstAnswer(
            missing.equals("student") ? UUID.randomUUID() : context.student(), VERSION,
            missing.equals("question") ? 151 : 1,
            missing.equals("session") ? UUID.randomUUID() : context.session(),
            missing.equals("attempt") ? UUID.randomUUID() : context.attempt(),
            "O", false, true));
  }

  @Test
  void firstAnswerQueriesKeepStudentVersionAndQuestionScope() {
    var owner = answerContext(1);
    var stranger = answerContext(2);
    var otherVersion = "answer-scope-" + UUID.randomUUID();
    insertContentVersion(otherVersion);
    jdbc.update("update learning_sessions set state='COMPLETED' where id=?", owner.session());
    var otherContext = answerContext(owner.student(), otherVersion);
    var first = firstAnswers.saveAndFlush(new FirstAnswer(UUID.randomUUID(), owner.student(),
        VERSION, 1, owner.session(), owner.attempt(), UUID.randomUUID(), AnswerChoice.O,
        false, true, clock.instant(), 0));
    firstAnswers.saveAndFlush(new FirstAnswer(UUID.randomUUID(), owner.student(), VERSION, 2,
        owner.session(), owner.attempt(), UUID.randomUUID(), AnswerChoice.X,
        false, false, clock.instant(), 0));
    var other = firstAnswers.saveAndFlush(new FirstAnswer(UUID.randomUUID(), owner.student(),
        otherVersion, 1, otherContext.session(), otherContext.attempt(), UUID.randomUUID(),
        AnswerChoice.X, false, false, clock.instant(), 0));
    firstAnswers.saveAndFlush(new FirstAnswer(UUID.randomUUID(), stranger.student(), VERSION, 1,
        stranger.session(), stranger.attempt(), UUID.randomUUID(), null,
        true, false, clock.instant(), 0));
    entityManager.clear();

    assertThat(firstAnswers.findByStudentAccountIdAndVersionAndQuestionId(owner.student(), VERSION, 1))
        .get().extracting(FirstAnswer::getId).isEqualTo(first.getId());
    assertThat(firstAnswers.findByStudentAccountIdAndVersionAndQuestionId(owner.student(), otherVersion, 1))
        .get().extracting(FirstAnswer::getId).isEqualTo(other.getId());
    assertThat(firstAnswers.findByStudentAccountIdAndVersionAndQuestionId(stranger.student(), VERSION, 2))
        .isEmpty();
    assertThat(firstAnswers.countByStudentAccountIdAndVersion(owner.student(), VERSION)).isEqualTo(2);
    assertThat(firstAnswers.countByStudentAccountIdAndVersion(owner.student(), otherVersion)).isEqualTo(1);
    assertThat(firstAnswers.countByStudentAccountIdAndVersion(stranger.student(), VERSION)).isEqualTo(1);
  }

  @Test
  void firstAnswerRejectsANullChoiceUnlessItIsTimedOut() {
    var context = answerContext(1);

    assertThatThrownBy(
            () ->
                jdbc.update(
                    "insert into first_answers"
                        + "(id,student_account_id,version,question_id,session_id,day_attempt_id,request_id,choice,timed_out,correct,answered_at,response_millis)"
                        + " values (?,?,?,?,?,?,?,null,false,false,?,0)",
                    UUID.randomUUID(),
                    context.student(),
                    VERSION,
                    1,
                    context.session(),
                    context.attempt(),
                    UUID.randomUUID(),
                    now()))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void firstAnswerRejectsNegativeResponseDuration() {
    var context = answerContext(1);

    assertThatThrownBy(
            () ->
                jdbc.update(
                    "insert into first_answers"
                        + "(id,student_account_id,version,question_id,session_id,day_attempt_id,request_id,choice,timed_out,correct,answered_at,response_millis)"
                        + " values (?,?,?,?,?,?,?,'X',false,false,?,-1)",
                    UUID.randomUUID(),
                    context.student(),
                    VERSION,
                    1,
                    context.session(),
                    context.attempt(),
                    UUID.randomUUID(),
                    now()))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void lastAnswerProjectionCanBeUpdatedWithoutCreatingHistory() {
    var student = student(1);
    var firstSource = UUID.randomUUID();
    var repeatSource = UUID.randomUUID();
    lastAnswers.saveAndFlush(
        new LastAnswer(
            student,
            VERSION,
            1,
            AnswerSourceType.FIRST,
            firstSource,
            AnswerChoice.X,
            false,
            false,
            AnswerOutcome.WRONG,
            clock.instant()));
    entityManager.clear();

    var projection =
        lastAnswers.findById(new LastAnswerId(student, VERSION, 1)).orElseThrow();
    projection.update(
        AnswerSourceType.REPEAT,
        repeatSource,
        null,
        true,
        false,
        AnswerOutcome.TIMED_OUT,
        clock.instant().plusSeconds(30));
    lastAnswers.flush();
    entityManager.clear();

    var reloaded = lastAnswers.findById(new LastAnswerId(student, VERSION, 1)).orElseThrow();
    assertThat(lastAnswers.count()).isEqualTo(1);
    assertThat(reloaded.getSourceType()).isEqualTo(AnswerSourceType.REPEAT);
    assertThat(reloaded.getSourceId()).isEqualTo(repeatSource);
    assertThat(reloaded.getChoice()).isNull();
    assertThat(reloaded.getOutcome()).isEqualTo(AnswerOutcome.TIMED_OUT);
    assertThat(reloaded.getAnsweredAt())
        .isEqualTo(Instant.parse("2026-10-12T00:00:30.123456Z"));
  }

  @ParameterizedTest
  @CsvSource(value = {"O,false,true,CORRECT", "X,false,false,WRONG", "NULL,true,false,TIMED_OUT"},
      nullValues = "NULL")
  void lastAnswerRoundTripsEveryConsistentOutcome(
      AnswerChoice choice, boolean timedOut, boolean correct, AnswerOutcome outcome) {
    var owner = student(1);
    var source = UUID.randomUUID();
    lastAnswers.saveAndFlush(new LastAnswer(owner, VERSION, 1, AnswerSourceType.FIRST, source,
        choice, timedOut, correct, outcome, clock.instant()));
    entityManager.clear();

    var reloaded = lastAnswers.findById(new LastAnswerId(owner, VERSION, 1)).orElseThrow();
    assertThat(reloaded.getSourceType()).isEqualTo(AnswerSourceType.FIRST);
    assertThat(reloaded.getSourceId()).isEqualTo(source);
    assertThat(reloaded.getChoice()).isEqualTo(choice);
    assertThat(reloaded.isTimedOut()).isEqualTo(timedOut);
    assertThat(reloaded.isCorrect()).isEqualTo(correct);
    assertThat(reloaded.getOutcome()).isEqualTo(outcome);
    assertThat(reloaded.getAnsweredAt())
        .isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
  }

  @ParameterizedTest
  @CsvSource(value = {
      "NULL,false,true,CORRECT", "NULL,false,false,WRONG",
      "O,true,true,CORRECT", "O,true,false,WRONG",
      "O,false,false,CORRECT", "O,false,true,WRONG",
      "NULL,true,true,TIMED_OUT", "O,true,false,TIMED_OUT",
      "NULL,false,false,TIMED_OUT", "O,false,false,TIMED_OUT",
      "NULL,true,false,CORRECT", "NULL,true,false,WRONG",
      "O,false,true,UNKNOWN", "Y,false,true,CORRECT"
  }, nullValues = "NULL")
  void lastAnswersRejectInconsistentOutcomesWithoutNullCheckLoopholes(
      String choice, boolean timedOut, boolean correct, String outcome) {
    var owner = student(1);

    assertSqlViolation("23514", null,
        () -> insertLastAnswer(owner, VERSION, 1, "FIRST", UUID.randomUUID(), choice,
            timedOut, correct, outcome));
  }

  @ParameterizedTest
  @ValueSource(strings = {"sourceType", "sourceId", "timedOut", "correct", "outcome"})
  void lastAnswersRequireExplicitSourceAndOutcomeFields(String missing) {
    var owner = student(1);

    assertSqlViolation("23502", null,
        () -> insertLastAnswer(owner, VERSION, 1,
            missing.equals("sourceType") ? null : "FIRST",
            missing.equals("sourceId") ? null : UUID.randomUUID(), "O",
            missing.equals("timedOut") ? null : false,
            missing.equals("correct") ? null : true,
            missing.equals("outcome") ? null : "CORRECT"));
  }

  @Test
  void lastAnswersRejectAnUnknownSourceType() {
    var owner = student(1);

    assertSqlViolation("23514", "last_answers_source_type_check",
        () -> insertLastAnswer(owner, VERSION, 1, "UNKNOWN", UUID.randomUUID(), "O",
            false, true, "CORRECT"));
  }

  @Test
  void lastAnswersHaveOneRowPerStudentVersionAndQuestion() {
    var owner = student(1);
    insertLastAnswer(owner, VERSION, 1, "FIRST", UUID.randomUUID(), "O", false, true, "CORRECT");

    assertSqlViolation("23505", "last_answers_pkey",
        () -> insertLastAnswer(owner, VERSION, 1, "REPEAT", UUID.randomUUID(), null,
            true, false, "TIMED_OUT"));
  }

  @ParameterizedTest
  @ValueSource(strings = {"student", "version", "question"})
  void lastAnswersRejectMissingStudentOrContent(String missing) {
    var owner = student(1);

    assertSqlViolation("23503", null,
        () -> insertLastAnswer(missing.equals("student") ? UUID.randomUUID() : owner,
            missing.equals("version") ? "missing-version" : VERSION,
            missing.equals("question") ? 151 : 1, "FIRST", UUID.randomUUID(), "O",
            false, true, "CORRECT"));
  }

  @Test
  void lastAnswerQueriesKeepStudentAndVersionScope() {
    var owner = student(1);
    var stranger = student(2);
    var otherVersion = "last-answer-scope-" + UUID.randomUUID();
    insertContentVersion(otherVersion);
    insertLastAnswer(owner, VERSION, 1, "FIRST", UUID.randomUUID(), "O", false, true, "CORRECT");
    insertLastAnswer(owner, VERSION, 2, "REPEAT", UUID.randomUUID(), "X", false, false, "WRONG");
    insertLastAnswer(
        owner, otherVersion, 1, "REPEAT", UUID.randomUUID(), null, true, false, "TIMED_OUT");
    insertLastAnswer(stranger, VERSION, 1, "FIRST", UUID.randomUUID(), "O", false, true, "CORRECT");
    entityManager.clear();

    assertThat(lastAnswers.findByIdStudentAccountIdAndIdVersion(owner, VERSION))
        .extracting(LastAnswer::getQuestionId).containsExactlyInAnyOrder(1, 2);
    assertThat(lastAnswers.findByIdStudentAccountIdAndIdVersion(owner, otherVersion))
        .singleElement().satisfies(answer -> {
          assertThat(answer.getStudentAccountId()).isEqualTo(owner);
          assertThat(answer.getVersion()).isEqualTo(otherVersion);
          assertThat(answer.getOutcome()).isEqualTo(AnswerOutcome.TIMED_OUT);
        });
    assertThat(lastAnswers.findByIdStudentAccountIdAndIdVersion(stranger, VERSION))
        .singleElement().extracting(LastAnswer::getStudentAccountId).isEqualTo(stranger);
    assertThat(lastAnswers.findByIdStudentAccountIdAndIdVersion(stranger, otherVersion)).isEmpty();
  }

  @Test
  void xpEntriesUseOneRuleVersionAndRejectADuplicateKindAndSource() {
    var student = student(1);
    var source = UUID.randomUUID();
    var entry =
        xpEntries.saveAndFlush(
            new XpEntry(
                UUID.randomUUID(),
                student,
                XpKind.FIRST_ANSWER,
                source,
                565,
                clock.instant()));
    entityManager.clear();

    assertThat(xpEntries.findById(entry.getId()).orElseThrow().getRuleVersion())
        .isEqualTo("learning-v1");
    assertThatThrownBy(
            () ->
                xpEntries.saveAndFlush(
                    new XpEntry(
                        UUID.randomUUID(),
                        student,
                        XpKind.FIRST_ANSWER,
                        source,
                        565,
                        clock.instant())))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void xpSourceUniquenessIsGlobalWithinEachKind() {
    var owner = student(1);
    var stranger = student(2);
    var source = UUID.randomUUID();
    for (XpKind kind : XpKind.values()) {
      xpEntries.saveAndFlush(new XpEntry(UUID.randomUUID(), owner, kind, source, 1, clock.instant()));
      assertThat(xpEntries.countByKindAndSourceId(kind, source)).isEqualTo(1);
    }

    assertSqlViolation("23505", "uq_xp_source",
        () -> insertXpEntry(stranger, "FIRST_ANSWER", source, 565, "learning-v1"));
  }

  @Test
  void mergingAReplacementCannotRewriteAnXpFact() {
    var owner = student(1);
    var stranger = student(2);
    var id = UUID.randomUUID();
    var source = UUID.randomUUID();
    xpEntries.saveAndFlush(new XpEntry(id, owner, XpKind.FIRST_ANSWER, source, 565, clock.instant()));
    entityManager.clear();

    xpEntries.saveAndFlush(new XpEntry(id, stranger, XpKind.REPEAT_ANSWER, UUID.randomUUID(), 1,
        clock.instant().plusSeconds(30)));
    entityManager.clear();

    var reloaded = xpEntries.findById(id).orElseThrow();
    assertThat(reloaded.getStudentAccountId()).isEqualTo(owner);
    assertThat(reloaded.getKind()).isEqualTo(XpKind.FIRST_ANSWER);
    assertThat(reloaded.getSourceId()).isEqualTo(source);
    assertThat(reloaded.getAmount()).isEqualTo(565);
    assertThat(reloaded.getRuleVersion()).isEqualTo("learning-v1");
    assertThat(reloaded.getCreatedAt())
        .isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
    assertThat(xpEntries.sumAmountByStudentAccountId(owner)).isEqualTo(565);
    assertThat(xpEntries.sumAmountByStudentAccountId(stranger)).isZero();
  }

  @ParameterizedTest
  @CsvSource({"0,learning-v1,FIRST_ANSWER", "-1,learning-v1,FIRST_ANSWER",
      "1,learning-v2,FIRST_ANSWER", "1,learning-v1,UNKNOWN"})
  void xpEntriesRejectNonpositiveAmountsUnknownRulesAndUnknownKinds(
      int amount, String rule, String kind) {
    var owner = student(1);

    assertSqlViolation("23514", null,
        () -> insertXpEntry(owner, kind, UUID.randomUUID(), amount, rule));
  }

  @ParameterizedTest
  @ValueSource(strings = {"kind", "source", "rule"})
  void xpEntriesRequireKindSourceAndRule(String missing) {
    var owner = student(1);

    assertSqlViolation("23502", null,
        () -> insertXpEntry(owner, missing.equals("kind") ? null : "FIRST_ANSWER",
            missing.equals("source") ? null : UUID.randomUUID(), 1,
            missing.equals("rule") ? null : "learning-v1"));
  }

  @Test
  void xpEntriesRejectAnUnknownStudent() {
    assertSqlViolation(
        "23503",
        "xp_entries_student_fk",
        () ->
            insertXpEntry(UUID.randomUUID(), "FIRST_ANSWER", UUID.randomUUID(), 1, "learning-v1"));
  }

  @Test
  void dayProgressRejectsMissingStudentForeignKey() {
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "insert into day_progress"
                        + "(id,student_account_id,version,day,state,created_at,updated_at)"
                        + " values (?,?,?,1,'NOT_STARTED',?,?)",
                    UUID.randomUUID(),
                    UUID.randomUUID(),
                    VERSION,
                    now(),
                    now()))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void dayProgressRequiresPassedAtExactlyForPassedState() {
    var student = student(1);

    assertThatThrownBy(
            () ->
                jdbc.update(
                    "insert into day_progress"
                        + "(id,student_account_id,version,day,state,passed_at,created_at,updated_at)"
                        + " values (?,?,?,1,'PASSED',null,?,?)",
                    UUID.randomUUID(),
                    student,
                    VERSION,
                    now(),
                    now()))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @ParameterizedTest
  @ValueSource(ints = {0, 31})
  void dayProgressRejectsDaysOutsideTheCourse(int day) {
    var student = student(1);

    assertCheckViolation(
        "day_progress_day_range",
        () ->
            jdbc.update(
                "insert into day_progress"
                    + "(id,student_account_id,version,day,state,created_at,updated_at)"
                    + " values (?,?,?,?,'NOT_STARTED',?,?)",
                UUID.randomUUID(),
                student,
                VERSION,
                day,
                now(),
                now()));
  }

  @Test
  void onlyOneNonCompletedSessionPerStudentIsAllowed() {
    var student = student(1);
    insertSession(UUID.randomUUID(), student, "QUESTION_ACTIVE", now());

    assertThatThrownBy(
            () -> insertSession(UUID.randomUUID(), student, "AWAITING_ADVANCE", now()))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void completedSessionsDoNotBlockANewActiveSession() {
    var student = student(1);
    insertSession(UUID.randomUUID(), student, "COMPLETED", now());
    insertSession(UUID.randomUUID(), student, "QUESTION_ACTIVE", now());

    assertThat(
            jdbc.queryForObject(
                "select count(*) from learning_sessions where student_account_id=?",
                Integer.class,
                student))
        .isEqualTo(2);
  }

  @ParameterizedTest
  @EnumSource(value = LearningMode.class, names = {"FIRST", "REPLAY"})
  void dayLearningSessionsRequireANonNullDay(LearningMode mode) {
    var student = student(1);

    assertCheckViolation(
        "learning_sessions_day_mode_check",
        () ->
            sessions.saveAndFlush(
                new LearningSession(
                    UUID.randomUUID(),
                    student,
                    VERSION,
                    mode,
                    null,
                    LearningSessionState.QUESTION_ACTIVE,
                    1,
                    LearningTime.deadline(clock, 10),
                    null,
                    clock.instant(),
                    clock.instant())));
  }

  @Test
  void reviewSessionPersistsWithoutADay() {
    var student = student(1);
    var session =
        sessions.saveAndFlush(
            new LearningSession(
                UUID.randomUUID(),
                student,
                VERSION,
                LearningMode.REVIEW,
                null,
                LearningSessionState.QUESTION_ACTIVE,
                1,
                LearningTime.deadline(clock, 10),
                null,
                clock.instant(),
                clock.instant()));
    entityManager.clear();

    var reloaded = sessions.findById(session.getId()).orElseThrow();
    assertThat(reloaded.getMode()).isEqualTo(LearningMode.REVIEW);
    assertThat(reloaded.getDay()).isNull();
  }

  @Test
  void reviewSessionRejectsADayNumber() {
    var student = student(1);

    assertCheckViolation(
        "learning_sessions_day_mode_check",
        () ->
            sessions.saveAndFlush(
                new LearningSession(
                    UUID.randomUUID(),
                    student,
                    VERSION,
                    LearningMode.REVIEW,
                    1,
                    LearningSessionState.QUESTION_ACTIVE,
                    1,
                    LearningTime.deadline(clock, 10),
                    null,
                    clock.instant(),
                    clock.instant())));
  }

  @ParameterizedTest
  @CsvSource({"FIRST, 0", "FIRST, 31", "REPLAY, 0", "REPLAY, 31"})
  void dayLearningSessionsRejectDaysOutsideTheCourse(LearningMode mode, int day) {
    var student = student(1);

    assertCheckViolation(
        "learning_sessions_day_mode_check",
        () ->
            sessions.saveAndFlush(
                new LearningSession(
                    UUID.randomUUID(),
                    student,
                    VERSION,
                    mode,
                    day,
                    LearningSessionState.QUESTION_ACTIVE,
                    1,
                    LearningTime.deadline(clock, 10),
                    null,
                    clock.instant(),
                    clock.instant())));
  }

  @ParameterizedTest
  @ValueSource(ints = {0, 31})
  void dayAttemptsRejectDaysOutsideTheCourse(int day) {
    assertInvalidAttempt(day, 1, "ACTIVE", 0, 0, 0, false, "day_attempts_day_range");
  }

  @ParameterizedTest
  @ValueSource(ints = {-1, 0})
  void dayAttemptsRejectNonpositiveAttemptNumbers(int attemptNumber) {
    assertInvalidAttempt(
        1, attemptNumber, "ACTIVE", 0, 0, 0, false, "day_attempts_number_positive");
  }

  @Test
  void dayAttemptsRejectAnUnknownState() {
    assertInvalidAttempt(1, 1, "UNKNOWN", 5, 3, 1, true, "day_attempts_state_check");
  }

  @ParameterizedTest
  @CsvSource({"-1, 0, 0", "6, 3, 1", "5, -1, 0", "3, 4, 0", "5, 3, -1", "5, 3, 4"})
  void dayAttemptsRejectCountsOutsideTheirOwnAndRelationalBounds(
      int answered, int correct, int streak) {
    assertInvalidAttempt(
        1, 1, "ACTIVE", answered, correct, streak, false, "day_attempts_counts_check");
  }

  @ParameterizedTest
  @CsvSource({"ACTIVE, true", "PASSED, false", "RETRY_REQUIRED, false"})
  void dayAttemptsRequireFinishedAtExactlyForTerminalStates(String state, boolean finished) {
    assertInvalidAttempt(1, 1, state, 5, 3, 1, finished, "day_attempts_finished_at_check");
  }

  @ParameterizedTest
  @EnumSource(value = DayAttemptState.class, names = {"PASSED", "RETRY_REQUIRED"})
  void terminalDayAttemptsRequireAllFiveAnswers(DayAttemptState state) {
    assertInvalidAttempt(1, 1, state.name(), 4, 2, 1, true, "day_attempts_terminal_count_check");
  }

  @Test
  void dayAttemptNumbersAreUniquePerStudentVersionAndDay() {
    var student = student(1);
    var progress = insertProgress(student);
    var firstSession = UUID.randomUUID();
    var secondSession = UUID.randomUUID();
    insertSession(firstSession, student, "COMPLETED", now());
    insertSession(secondSession, student, "COMPLETED", now());
    insertAttempt(UUID.randomUUID(), firstSession, progress, student, 1);

    assertThatThrownBy(
            () -> insertAttempt(UUID.randomUUID(), secondSession, progress, student, 1))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void dayAttemptCannotUseAnotherStudentsSession() {
    var sessionOwner = student(1);
    var attemptOwner = student(2);
    var session = UUID.randomUUID();
    insertSession(session, sessionOwner, "COMPLETED", now());
    var progress = insertProgress(attemptOwner);

    assertThatThrownBy(
            () -> insertAttempt(UUID.randomUUID(), session, progress, attemptOwner, 1))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void dayAttemptCannotUseAnotherStudentsProgress() {
    var attemptOwner = student(1);
    var progressOwner = student(2);
    var session = UUID.randomUUID();
    insertSession(session, attemptOwner, "COMPLETED", now());
    var progress = insertProgress(progressOwner);

    assertThatThrownBy(
            () -> insertAttempt(UUID.randomUUID(), session, progress, attemptOwner, 1))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void sessionQuestionPositionIsUniqueWithinASession() {
    var student = student(1);
    var session = UUID.randomUUID();
    insertSession(session, student, "QUESTION_ACTIVE", now());
    insertSessionQuestion(session, 1, 1);

    assertThatThrownBy(() -> insertSessionQuestion(session, 1, 2))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @ParameterizedTest
  @ValueSource(ints = {0, 151})
  void sessionQuestionPositionsMustBeWithinTheFixedOrder(int position) {
    var student = student(1);
    var session = UUID.randomUUID();
    insertSession(session, student, "QUESTION_ACTIVE", now());

    assertCheckViolation(
        "learning_session_questions_position_range",
        () -> insertSessionQuestion(session, position, 1));
  }

  @Test
  void sessionQuestionsMustUseTheOwningSessionsContentVersion() {
    var otherVersion = "contract-" + UUID.randomUUID();
    insertContentVersion(otherVersion);
    var student = student(1);
    var session = UUID.randomUUID();
    insertSession(session, student, "QUESTION_ACTIVE", now());
    insertSessionQuestion(session, 1, VERSION, 1);

    assertThat(
            jdbc.queryForObject(
                "select count(*) from learning_session_questions where session_id=?",
                Integer.class,
                session))
        .isEqualTo(1);
    assertThatThrownBy(() -> insertSessionQuestion(session, 2, otherVersion, 1))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void idempotencyKeysAreScopedByOperation() {
    var student = student(1);
    var requestId = UUID.randomUUID();
    insertIdempotency(student, "START_SESSION", requestId);
    insertIdempotency(student, "SUBMIT_ANSWER", requestId);

    assertThat(
            jdbc.queryForObject(
                "select count(*) from idempotency_records"
                    + " where student_account_id=? and request_id=?",
                Integer.class,
                student,
                requestId))
        .isEqualTo(2);
    assertThatThrownBy(() -> insertIdempotency(student, "START_SESSION", requestId))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void idempotencyEntityRoundTripsAnObjectJsonbSnapshot() {
    var student = student(1);
    var requestId = UUID.randomUUID();
    var responseJson = "{\"status\":\"stored\",\"nested\":{\"value\":7}}";
    idempotencyRecords.saveAndFlush(
        new IdempotencyRecord(
            student,
            IdempotencyOperation.START_SESSION,
            requestId,
            "b".repeat(64),
            responseJson,
            clock.instant()));
    entityManager.clear();

    var reloaded =
        idempotencyRecords
            .findById(
                new IdempotencyRecordId(
                    student, IdempotencyOperation.START_SESSION, requestId))
            .orElseThrow();
    assertThat(reloaded.getStudentAccountId()).isEqualTo(student);
    assertThat(reloaded.getOperation()).isEqualTo(IdempotencyOperation.START_SESSION);
    assertThat(reloaded.getRequestId()).isEqualTo(requestId);
    assertThat(reloaded.getPayloadHash()).isEqualTo("b".repeat(64));
    assertThat(reloaded.getResponseJson()).contains("\"status\"", "\"stored\"");
    assertThat(reloaded.getCreatedAt())
        .isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
    assertThat(
            jdbc.queryForObject(
                "select jsonb_typeof(response_json) from idempotency_records"
                    + " where student_account_id=? and operation='START_SESSION' and request_id=?",
                String.class,
                student,
                requestId))
        .isEqualTo("object");
    assertThat(
            jdbc.queryForObject(
                "select response_json->'nested'->>'value' from idempotency_records"
                    + " where student_account_id=? and operation='START_SESSION' and request_id=?",
                String.class,
                student,
                requestId))
        .isEqualTo("7");
  }

  @Test
  void idempotencyEntityRejectsAnUppercasePayloadHash() {
    var student = student(1);

    assertThatThrownBy(
            () ->
                idempotencyRecords.saveAndFlush(
                    new IdempotencyRecord(
                        student,
                        IdempotencyOperation.START_SESSION,
                        UUID.randomUUID(),
                        "A".repeat(64),
                        "{\"ok\":true}",
                        clock.instant())))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void deadlineRoundTripsWithoutNanosecondDrift() {
    var owner = student(1);
    var deadline = LearningTime.deadline(clock, 10);
    var session =
        sessions.saveAndFlush(
            new LearningSession(
                UUID.randomUUID(),
                owner,
                VERSION,
                LearningMode.FIRST,
                1,
                LearningSessionState.QUESTION_ACTIVE,
                1,
                deadline,
                null,
                clock.instant(),
                clock.instant()));
    entityManager.clear();

    assertThat(sessions.findById(session.getId()).orElseThrow().getDeadlineAt())
        .isEqualTo(deadline);
  }

  @Test
  void ownedSessionQueriesHideAnotherStudentsSession() {
    var owner = student(1);
    var stranger = student(2);
    var deadline = LearningTime.deadline(clock, 10);
    var session =
        sessions.saveAndFlush(
            new LearningSession(
                UUID.randomUUID(),
                owner,
                VERSION,
                LearningMode.FIRST,
                1,
                LearningSessionState.QUESTION_ACTIVE,
                1,
                deadline,
                null,
                clock.instant(),
                clock.instant()));

    assertThat(sessions.findActiveByStudentAccountId(owner)).isPresent();
    assertThat(sessions.findOwned(session.getId(), stranger)).isEmpty();
    assertThat(sessions.findLockedOwned(session.getId(), stranger)).isEmpty();
  }

  @Test
  void expiryQueryFiltersStatesAndUsesDeadlineThenUuidOrderAcrossPages() {
    var earlier = UUID.fromString("00000000-0000-4000-8000-000000000002");
    var tied = UUID.fromString("00000000-0000-4000-8000-000000000003");
    var atBoundary = UUID.fromString("00000000-0000-4000-8000-000000000001");
    var future = UUID.fromString("00000000-0000-4000-8000-000000000004");
    var awaiting = UUID.fromString("00000000-0000-4000-8000-000000000005");
    var completed = UUID.fromString("00000000-0000-4000-8000-000000000006");
    var observedAt = Instant.parse("2026-10-12T00:00:00.123456Z");
    var earlierDeadline = Timestamp.from(Instant.parse("2026-10-11T23:59:50.123456Z"));
    insertSession(tied, student(1), "QUESTION_ACTIVE", earlierDeadline);
    insertSession(earlier, student(2), "QUESTION_ACTIVE", earlierDeadline);
    insertSession(atBoundary, student(3), "QUESTION_ACTIVE", Timestamp.from(observedAt));
    insertSession(
        future,
        student(4),
        "QUESTION_ACTIVE",
        Timestamp.from(Instant.parse("2026-10-12T00:00:10.123456Z")));
    insertSession(awaiting, student(5), "AWAITING_ADVANCE", earlierDeadline);
    insertSession(completed, student(6), "COMPLETED", earlierDeadline);

    assertThat(sessions.findExpiredIds(observedAt, PageRequest.of(0, 100)))
        .containsExactly(earlier, tied, atBoundary);
    assertThat(sessions.findExpiredIds(observedAt, PageRequest.of(0, 2)))
        .containsExactly(earlier, tied);
    assertThat(sessions.findExpiredIds(observedAt, PageRequest.of(1, 2)))
        .containsExactly(atBoundary);
    assertThat(sessions.findExpiredIds(observedAt, PageRequest.of(2, 2))).isEmpty();
  }

  @Test
  void nextAttemptNumberUsesTheHighestPersistedAttempt() {
    var student = student(1);
    var progress = insertProgress(student);
    var session = UUID.randomUUID();
    var laterSession = UUID.randomUUID();
    insertSession(session, student, "COMPLETED", now());
    insertSession(laterSession, student, "COMPLETED", now());
    insertAttempt(UUID.randomUUID(), session, progress, student, 1);
    insertAttempt(UUID.randomUUID(), laterSession, progress, student, 7);
    var stranger = student(2);
    var otherVersion = "empty-attempt-scope-" + UUID.randomUUID();
    insertContentVersion(otherVersion);
    entityManager.clear();

    assertThat(attempts.nextAttemptNumber(student, VERSION, 1)).isEqualTo(8);
    assertThat(attempts.nextAttemptNumber(stranger, VERSION, 1)).isEqualTo(1);
    assertThat(attempts.nextAttemptNumber(student, otherVersion, 1)).isEqualTo(1);
    assertThat(attempts.nextAttemptNumber(student, VERSION, 2)).isEqualTo(1);
  }

  @Test
  void studentContextComesFromTheValidatedPrincipalChain() {
    var school = fixtures.school("학생 접근 학교");
    var teacher = fixtures.teacher(school);
    var classroom =
        fixtures.classroom(school, teacher, "1", 1, LocalDate.of(2026, 10, 12));
    var student = fixtures.student(classroom, 1, "학생", "별빛");

    assertThat(access.requireStudent(AuthenticationModule.principal(student)))
        .isEqualTo(
            new StudentLearningContext(
                student.getId(), classroom.getId(), LocalDate.of(2026, 10, 12)));
    assertThat(access.lockStudent(AuthenticationModule.principal(student)))
        .isEqualTo(
            new StudentLearningContext(
                student.getId(), classroom.getId(), LocalDate.of(2026, 10, 12)));
  }

  @Test
  void brokenStudentProfileChainFailsAsUnauthenticated() {
    var school = fixtures.school("끊어진 학생 접근 학교");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1", 1);
    var student = fixtures.student(classroom, 1, "학생", "별빛");
    jdbc.update("delete from student_profiles where account_id=?", student.getId());
    entityManager.clear();

    assertThatThrownBy(() -> access.requireStudent(AuthenticationModule.principal(student)))
        .isInstanceOfSatisfying(
            ApiException.class,
            error -> assertThat(error.code()).isEqualTo("UNAUTHENTICATED"));
  }

  @Test
  void reviewAttemptEntityNormalizesTimeAndCannotBeRewrittenByMerge() {
    var row = reviewRow("REPLAY");
    var fact =
        new ReviewAttempt(
            (UUID) row.get("id"),
            (UUID) row.get("student_account_id"),
            VERSION,
            1,
            (UUID) row.get("session_id"),
            (UUID) row.get("day_attempt_id"),
            LearningMode.REPLAY,
            (UUID) row.get("request_id"),
            AnswerChoice.O,
            false,
            true,
            AnswerOutcome.CORRECT,
            clock.instant(),
            3_000_000_000L);
    reviewAttempts.saveAndFlush(fact);
    entityManager.clear();
    var replacement =
        new ReviewAttempt(
            (UUID) row.get("id"),
            (UUID) row.get("student_account_id"),
            VERSION,
            2,
            (UUID) row.get("session_id"),
            (UUID) row.get("day_attempt_id"),
            LearningMode.REPLAY,
            UUID.randomUUID(),
            null,
            true,
            false,
            AnswerOutcome.TIMED_OUT,
            clock.instant().plusSeconds(30),
            30L);
    reviewAttempts.saveAndFlush(replacement);
    entityManager.clear();
    var reloaded = reviewAttempts.findById(fact.getId()).orElseThrow();
    assertThat(reloaded.getQuestionId()).isEqualTo(1);
    assertThat(reloaded.getStudentAccountId()).isEqualTo(row.get("student_account_id"));
    assertThat(reloaded.getVersion()).isEqualTo(VERSION);
    assertThat(reloaded.getSessionId()).isEqualTo(row.get("session_id"));
    assertThat(reloaded.getDayAttemptId()).isEqualTo(row.get("day_attempt_id"));
    assertThat(reloaded.getMode()).isEqualTo(LearningMode.REPLAY);
    assertThat(reloaded.getRequestId()).isEqualTo(row.get("request_id"));
    assertThat(reloaded.getChoice()).isEqualTo(AnswerChoice.O);
    assertThat(reloaded.isTimedOut()).isFalse();
    assertThat(reloaded.isCorrect()).isTrue();
    assertThat(reloaded.getOutcome()).isEqualTo(AnswerOutcome.CORRECT);
    assertThat(reloaded.getAnsweredAt()).isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
    assertThat(reloaded.getResponseMillis()).isEqualTo(3_000_000_000L);
    assertThat(reviewAttempts.existsBySessionIdAndQuestionId(fact.getSessionId(), 1)).isTrue();
    assertThat(reviewAttempts.existsBySessionIdAndQuestionId(fact.getSessionId(), 2)).isFalse();
    assertThat(reviewAttempts.existsBySessionIdAndQuestionId(UUID.randomUUID(), 1)).isFalse();
  }

  @Test
  void v5ReviewAttemptsExistAndAllForeignKeysPreventImplicitDeletion() {
    assertThat(jdbc.queryForObject("select to_regclass('review_attempts')::text", String.class))
        .isEqualTo("review_attempts");
    assertThat(
            jdbc.queryForList(
                "select conname from pg_constraint where conrelid='review_attempts'::regclass and"
                    + " contype='f' order by conname",
                String.class))
        .containsExactly(
            "review_attempts_attempt_identity_fk",
            "review_attempts_question_fk",
            "review_attempts_session_identity_fk",
            "review_attempts_session_question_fk",
            "review_attempts_student_fk");
    assertThat(
            jdbc.queryForList(
                "select confdeltype::text from pg_constraint where"
                    + " conrelid='review_attempts'::regclass and contype='f'",
                String.class))
        .containsOnly("a");
    assertThat(
            jdbc.queryForList(
                "select conname from pg_constraint where conrelid='review_attempts'::regclass and"
                    + " contype='c' order by conname",
                String.class))
        .containsExactly(
            "review_attempts_choice_check",
            "review_attempts_day_attempt_mode_check",
            "review_attempts_mode_check",
            "review_attempts_outcome_check",
            "review_attempts_response_millis_check");
  }

  @ParameterizedTest
  @CsvSource(
      value = {"O,false,true,CORRECT", "X,false,false,WRONG", "NULL,true,false,TIMED_OUT"},
      nullValues = "NULL")
  void reviewAttemptsAcceptConsistentReplayFactsAndLongResponseMillis(
      String choice, boolean timedOut, boolean correct, String outcome) {
    var row = reviewRow("REPLAY");
    row.put("choice", choice);
    row.put("timed_out", timedOut);
    row.put("correct", correct);
    row.put("outcome", outcome);
    row.put("response_millis", 3_000_000_000L);
    insertReview(row);
    var stored = jdbc.queryForMap("select * from review_attempts where id=?", row.get("id"));
    assertThat(stored.get("choice")).isEqualTo(choice);
    assertThat(stored.get("outcome")).isEqualTo(outcome);
    assertThat(stored.get("request_id")).isEqualTo(row.get("request_id"));
    assertThat(stored.get("response_millis")).isEqualTo(3_000_000_000L);
    assertThat(stored.get("answered_at")).isEqualTo(now());
  }

  @Test
  void reviewStorageAllowsReviewWithoutADayAttemptForTheNextTask() {
    var row = reviewRow("REVIEW");
    insertReview(row);
    assertThat(
            jdbc.queryForObject(
                "select day_attempt_id is null and mode='REVIEW' from review_attempts where id=?",
                Boolean.class,
                row.get("id")))
        .isTrue();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "id",
        "student_account_id",
        "version",
        "question_id",
        "session_id",
        "mode",
        "request_id",
        "timed_out",
        "correct",
        "outcome",
        "answered_at",
        "response_millis"
      })
  void reviewAttemptsRequireEveryNonnullableIdentityAndOutcomeField(String missing) {
    var row = reviewRow("REPLAY");
    row.put(missing, null);
    assertSqlViolation("23502", null, () -> insertReview(row));
  }

  @ParameterizedTest
  @CsvSource(
      value = {
        "NULL,false,true,CORRECT",
        "NULL,false,false,WRONG",
        "O,true,true,CORRECT",
        "O,true,false,WRONG",
        "O,false,false,CORRECT",
        "O,false,true,WRONG",
        "NULL,true,true,TIMED_OUT",
        "O,true,false,TIMED_OUT",
        "NULL,false,false,TIMED_OUT",
        "O,false,false,TIMED_OUT",
        "NULL,true,false,CORRECT",
        "NULL,true,false,WRONG",
        "O,false,true,UNKNOWN",
        "Y,false,true,CORRECT"
      },
      nullValues = "NULL")
  void reviewAttemptsRejectEveryInconsistentOutcomeAndInvalidChoice(
      String choice, boolean timedOut, boolean correct, String outcome) {
    var row = reviewRow("REPLAY");
    row.put("choice", choice);
    row.put("timed_out", timedOut);
    row.put("correct", correct);
    row.put("outcome", outcome);
    assertSqlViolation("23514", null, () -> insertReview(row));
  }

  @ParameterizedTest
  @ValueSource(strings = {"FIRST", "UNKNOWN"})
  void reviewAttemptsRejectModesOtherThanReplayAndReview(String mode) {
    var row = reviewRow("REPLAY");
    row.put("mode", mode);
    assertSqlViolation("23514", null, () -> insertReview(row));
  }

  @Test
  void replayFactsRequireADayAttempt() {
    var row = reviewRow("REPLAY");
    row.put("day_attempt_id", null);
    assertCheckViolation("review_attempts_day_attempt_mode_check", () -> insertReview(row));
  }

  @Test
  void reviewFactsCannotClaimADayAttempt() {
    var row = reviewRow("REPLAY");
    row.put("mode", "REVIEW");
    assertCheckViolation("review_attempts_day_attempt_mode_check", () -> insertReview(row));
  }

  @Test
  void reviewAttemptsRejectNegativeResponseMillis() {
    var row = reviewRow("REPLAY");
    row.put("response_millis", -1);
    assertCheckViolation("review_attempts_response_millis_check", () -> insertReview(row));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {"student_account_id", "version", "question_id", "session_id", "day_attempt_id"})
  void reviewAttemptsRejectMissingReferencedIdentities(String missing) {
    var row = reviewRow("REPLAY");
    row.put(
        missing,
        missing.equals("version")
            ? "missing-version"
            : missing.equals("question_id") ? 151 : UUID.randomUUID());
    assertSqlViolation("23503", null, () -> insertReview(row));
  }

  @Test
  void reviewAttemptsCannotClaimAnotherStudentsSession() {
    var row = reviewRow("REPLAY");
    row.put("student_account_id", student(2));
    assertSqlViolation("23503", "review_attempts_session_identity_fk", () -> insertReview(row));
  }

  @Test
  void reviewAttemptsCannotClaimAnotherContentVersion() {
    var row = reviewRow("REPLAY");
    var other = "repeat-version-" + UUID.randomUUID();
    insertContentVersion(other);
    row.put("version", other);
    assertSqlViolation("23503", "review_attempts_session_identity_fk", () -> insertReview(row));
  }

  @Test
  void reviewAttemptsMustUseTheOwningSessionsMode() {
    var row = reviewRow("REPLAY");
    jdbc.update("update learning_sessions set mode='FIRST' where id=?", row.get("session_id"));
    assertSqlViolation("23503", "review_attempts_session_identity_fk", () -> insertReview(row));
  }

  @Test
  void reviewAttemptsCannotUseAnAttemptFromAnotherSession() {
    var row = reviewRow("REPLAY");
    var otherSession = UUID.randomUUID();
    insertSession(otherSession, (UUID) row.get("student_account_id"), "COMPLETED", now());
    var otherAttempt = UUID.randomUUID();
    var progress =
        jdbc.queryForObject(
            "select day_progress_id from day_attempts where id=?",
            UUID.class,
            row.get("day_attempt_id"));
    insertAttempt(otherAttempt, otherSession, progress, (UUID) row.get("student_account_id"), 2);
    row.put("day_attempt_id", otherAttempt);
    assertSqlViolation("23503", "review_attempts_attempt_identity_fk", () -> insertReview(row));
  }

  @Test
  void reviewAttemptsMustReferenceAQuestionInTheirFixedSessionOrder() {
    var row = reviewRow("REPLAY");
    row.put("question_id", 2);
    assertSqlViolation("23503", "review_attempts_session_question_fk", () -> insertReview(row));
  }

  @Test
  void reviewAttemptsHaveOneFactPerSessionQuestion() {
    var row = reviewRow("REPLAY");
    insertReview(row);
    row.put("id", UUID.randomUUID());
    row.put("request_id", UUID.randomUUID());
    assertSqlViolation("23505", "uq_review_attempt_session_question", () -> insertReview(row));
  }

  @Test
  void newRepeatSessionsMayAnswerTheSameQuestionAgain() {
    var first = reviewRow("REPLAY");
    insertReview(first);
    jdbc.update(
        "update learning_sessions set state='COMPLETED' where id=?", first.get("session_id"));
    var next = UUID.randomUUID();
    var student = (UUID) first.get("student_account_id");
    var progress =
        jdbc.queryForObject(
            "select day_progress_id from day_attempts where id=?",
            UUID.class,
            first.get("day_attempt_id"));
    insertSession(next, student, "COMPLETED", now());
    jdbc.update("update learning_sessions set mode='REPLAY' where id=?", next);
    insertSessionQuestion(next, 1, 1);
    var attempt = UUID.randomUUID();
    insertAttempt(attempt, next, progress, student, 2);
    first.put("id", UUID.randomUUID());
    first.put("session_id", next);
    first.put("day_attempt_id", attempt);
    first.put("request_id", UUID.randomUUID());
    insertReview(first);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from review_attempts where student_account_id=?",
                Integer.class,
                student))
        .isEqualTo(2);
  }

  private java.util.LinkedHashMap<String, Object> reviewRow(String mode) {
    AnswerContext context;
    if (mode.equals("REPLAY")) {
      context = answerContext(1);
      jdbc.update("update learning_sessions set mode='REPLAY' where id=?", context.session());
    } else {
      var student = student(1);
      var session = UUID.randomUUID();
      jdbc.update(
          "insert into"
              + " learning_sessions(id,student_account_id,version,mode,day,state,current_position,deadline_at,created_at,updated_at)"
              + " values (?,?,?,'REVIEW',null,'QUESTION_ACTIVE',1,?,?,?)",
          session,
          student,
          VERSION,
          now(),
          now(),
          now());
      context = new AnswerContext(student, session, null);
    }
    insertSessionQuestion(context.session(), 1, 1);
    var row = new java.util.LinkedHashMap<String, Object>();
    row.put("id", UUID.randomUUID());
    row.put("student_account_id", context.student());
    row.put("version", VERSION);
    row.put("question_id", 1);
    row.put("session_id", context.session());
    row.put("day_attempt_id", context.attempt());
    row.put("mode", mode);
    row.put("request_id", UUID.randomUUID());
    row.put("choice", "O");
    row.put("timed_out", false);
    row.put("correct", true);
    row.put("outcome", "CORRECT");
    row.put("answered_at", now());
    row.put("response_millis", 0L);
    return row;
  }

  @Test
  void v6MasteryAndQueueTablesUseOnlyNoActionForeignKeys() {
    for (String table : new String[] {"review_masteries", "review_queue_entries"}) {
      assertThat(jdbc.queryForObject("select to_regclass(?)::text", String.class, table))
          .isEqualTo(table);
      assertThat(
              jdbc.queryForList(
                  "select confdeltype::text from pg_constraint where conrelid=cast(? as regclass)"
                      + " and contype='f'",
                  String.class,
                  table))
          .isNotEmpty()
          .containsOnly("a");
    }
    assertThat(
            jdbc.queryForList(
                "select conname from pg_constraint where conrelid='review_masteries'::regclass and"
                    + " contype='f' order by conname",
                String.class))
        .containsExactly(
            "review_masteries_first_correct_identity_fk",
            "review_masteries_question_fk",
            "review_masteries_student_fk");
    assertThat(
            jdbc.queryForList(
                "select conname from pg_constraint where conrelid='review_queue_entries'::regclass"
                    + " and contype='c' order by conname",
                String.class))
        .containsExactly(
            "review_queue_entries_active_release_check",
            "review_queue_entries_reason_check",
            "review_queue_entries_release_time_check");
  }

  @Test
  void v6PrivateEntitiesAreMappedForJpaValidation() {
    var fact = reviewRow("REVIEW");
    insertReview(fact);
    var owner = (UUID) fact.get("student_account_id");
    var source = (UUID) fact.get("id");
    var key = new ReviewMasteryId(owner, VERSION, 1);
    masteries.saveAndFlush(new ReviewMastery(owner, VERSION, 1, source, clock.instant()));
    reviewQueue.saveAndFlush(
        new ReviewQueueEntry(
            owner, VERSION, 1, ReviewQueueReason.AUTO_FIRST_WRONG, true, clock.instant(), null));
    entityManager.clear();
    var mastery = masteries.findById(key).orElseThrow();
    assertThat(mastery.getStudentAccountId()).isEqualTo(owner);
    assertThat(mastery.getVersion()).isEqualTo(VERSION);
    assertThat(mastery.getQuestionId()).isEqualTo(1);
    assertThat(mastery.getMasteredAt()).isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
    assertThat(mastery.getFirstCorrectAttemptId()).isEqualTo(source);
    // A detached replacement cannot rewrite the immutable first-correct timestamp or source.
    masteries.saveAndFlush(
        new ReviewMastery(owner, VERSION, 1, UUID.randomUUID(), clock.instant().plusSeconds(30)));
    entityManager.clear();
    var reloaded = masteries.findById(key).orElseThrow();
    assertThat(reloaded.getFirstCorrectAttemptId()).isEqualTo(source);
    assertThat(reloaded.getMasteredAt()).isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
    var queueKey = new ReviewQueueEntryId(owner, VERSION, 1);
    var entry = reviewQueue.findById(queueKey).orElseThrow();
    assertThat(entry.getStudentAccountId()).isEqualTo(owner);
    assertThat(entry.getVersion()).isEqualTo(VERSION);
    assertThat(entry.getQuestionId()).isEqualTo(1);
    assertThat(entry.getReason()).isEqualTo(ReviewQueueReason.AUTO_FIRST_WRONG);
    assertThat(entry.isActive()).isTrue();
    assertThat(entry.getCreatedAt()).isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
    entry.releaseAuto(clock.instant().plusSeconds(1));
    reviewQueue.saveAndFlush(entry);
    entityManager.clear();
    var released = reviewQueue.findById(queueKey).orElseThrow();
    assertThat(released.isActive()).isFalse();
    assertThat(released.getReleasedAt()).isEqualTo(Instant.parse("2026-10-12T00:00:01.123456Z"));
    released.releaseAuto(clock.instant().plusSeconds(2));
    reviewQueue.saveAndFlush(released);
    entityManager.clear();
    assertThat(reviewQueue.findById(queueKey).orElseThrow().getReleasedAt())
        .isEqualTo(Instant.parse("2026-10-12T00:00:01.123456Z"));
  }

  @ParameterizedTest
  @ValueSource(strings = {"REVIEW", "REPLAY"})
  void masteryReferencesACorrectRepeatFactWithMatchingStudentVersionAndQuestion(String mode) {
    var fact = reviewRow(mode);
    insertReview(fact);
    var row = masteryRow(fact);
    insertPrivateRow("review_masteries", row);
    assertThat(
            jdbc.queryForObject(
                "select first_correct_attempt_id from review_masteries where student_account_id=?",
                UUID.class,
                fact.get("student_account_id")))
        .isEqualTo(fact.get("id"));
  }

  @ParameterizedTest
  @ValueSource(strings = {"wrong", "timeout", "missing-source", "student", "version", "question"})
  void masteryRejectsAnInvalidOrForeignFirstCorrectSource(String invalid) {
    var fact = reviewRow("REVIEW");
    if (invalid.equals("wrong") || invalid.equals("timeout")) {
      fact.put("correct", false);
      fact.put("outcome", invalid.equals("timeout") ? "TIMED_OUT" : "WRONG");
      if (invalid.equals("timeout")) {
        fact.put("timed_out", true);
        fact.put("choice", null);
      }
    }
    insertReview(fact);
    var row = masteryRow(fact);
    switch (invalid) {
      case "missing-source" -> row.put("first_correct_attempt_id", UUID.randomUUID());
      case "student" -> row.put("student_account_id", student(2));
      case "version" -> {
        var version = "mastery-" + UUID.randomUUID();
        insertContentVersion(version);
        row.put("version", version);
      }
      case "question" -> row.put("question_id", 2);
    }
    assertSqlViolation(
        "23503",
        "review_masteries_first_correct_identity_fk",
        () -> insertPrivateRow("review_masteries", row));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "student_account_id",
        "version",
        "question_id",
        "first_correct_attempt_id",
        "mastered_at"
      })
  void masteryRequiresEveryIdentityAndFirstCorrectField(String column) {
    var fact = reviewRow("REVIEW");
    insertReview(fact);
    var row = masteryRow(fact);
    row.put(column, null);
    assertSqlViolation("23502", null, () -> insertPrivateRow("review_masteries", row));
  }

  @Test
  void masteryHasOneRowPerStudentVersionAndQuestion() {
    var fact = reviewRow("REVIEW");
    insertReview(fact);
    var row = masteryRow(fact);
    insertPrivateRow("review_masteries", row);
    assertSqlViolation(
        "23505", "review_masteries_pkey", () -> insertPrivateRow("review_masteries", row));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {"student_account_id", "version", "question_id", "reason", "active", "created_at"})
  void queueRequiresEveryIdentityPolicyAndActivationField(String column) {
    var row = queueRow();
    row.put(column, null);
    assertSqlViolation("23502", null, () -> insertPrivateRow("review_queue_entries", row));
  }

  @ParameterizedTest
  @CsvSource(
      value = {
        "AUTO_FIRST_WRONG,true,NULL",
        "USER_AFTER_LATER_WRONG,true,NULL",
        "AUTO_FIRST_WRONG,false,0",
        "USER_AFTER_LATER_WRONG,false,1"
      },
      nullValues = "NULL")
  void queueAcceptsBothReasonsAndConsistentActiveReleaseTimes(
      String reason, boolean active, Integer seconds) {
    var row = queueRow();
    row.put("reason", reason);
    row.put("active", active);
    row.put(
        "released_at",
        seconds == null ? null : Timestamp.from(now().toInstant().plusSeconds(seconds)));
    insertPrivateRow("review_queue_entries", row);
    assertThat(
            jdbc.queryForMap(
                "select * from review_queue_entries where student_account_id=?",
                row.get("student_account_id")))
        .containsAllEntriesOf(row);
  }

  @ParameterizedTest
  @CsvSource(
      value = {"true,0", "false,NULL"},
      nullValues = "NULL")
  void queueRejectsInconsistentActiveReleaseTimes(boolean active, Integer seconds) {
    var row = queueRow();
    row.put("active", active);
    row.put("released_at", seconds == null ? null : now());
    assertSqlViolation(
        "23514",
        "review_queue_entries_active_release_check",
        () -> insertPrivateRow("review_queue_entries", row));
  }

  @Test
  void queueCannotReleaseBeforeItsActivation() {
    var row = queueRow();
    row.put("active", false);
    row.put("released_at", Timestamp.from(now().toInstant().minusNanos(1000)));
    assertSqlViolation(
        "23514",
        "review_queue_entries_release_time_check",
        () -> insertPrivateRow("review_queue_entries", row));
  }

  @ParameterizedTest
  @ValueSource(strings = {"USER", "AUTO", "", "UNKNOWN"})
  void queueRejectsUnknownReasons(String reason) {
    var row = queueRow();
    row.put("reason", reason);
    assertSqlViolation(
        "23514",
        "review_queue_entries_reason_check",
        () -> insertPrivateRow("review_queue_entries", row));
  }

  @ParameterizedTest
  @ValueSource(strings = {"student", "version", "question"})
  void queueCannotReferenceMissingOwnershipOrContent(String invalid) {
    var row = queueRow();
    switch (invalid) {
      case "student" -> row.put("student_account_id", UUID.randomUUID());
      case "version" -> row.put("version", "missing-version");
      case "question" -> row.put("question_id", 151);
    }
    assertSqlViolation("23503", null, () -> insertPrivateRow("review_queue_entries", row));
  }

  @Test
  void queueHasOneRowPerStudentVersionAndQuestion() {
    var row = queueRow();
    insertPrivateRow("review_queue_entries", row);
    row.put("reason", "USER_AFTER_LATER_WRONG");
    assertSqlViolation(
        "23505", "review_queue_entries_pkey", () -> insertPrivateRow("review_queue_entries", row));
  }

  @Test
  void v7BookmarksExistWithOnlyNoActionStudentVersionAndQuestionForeignKeys() {
    assertThat(jdbc.queryForObject("select to_regclass('private_bookmarks')::text", String.class))
        .isEqualTo("private_bookmarks");
    assertThat(
            jdbc.queryForList(
                "select confdeltype::text from pg_constraint where"
                    + " conrelid='private_bookmarks'::regclass and contype='f'",
                String.class))
        .hasSize(3)
        .containsOnly("a");
    assertThat(entityManager.getMetamodel().getEntities())
        .extracting(jakarta.persistence.metamodel.EntityType::getName)
        .contains("PrivateBookmark");
  }

  @Test
  void bookmarksPersistIndependentlyAndAllowTheSameQuestionForDifferentStudents() {
    var row = bookmarkRow();
    insertPrivateRow("private_bookmarks", row);
    var owner = row.get("student_account_id");
    row.put("student_account_id", student(2));
    insertPrivateRow("private_bookmarks", row);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from private_bookmarks where student_account_id=?",
                Integer.class,
                owner))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from review_queue_entries where student_account_id=?",
                Integer.class,
                owner))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "select count(*) from review_masteries where student_account_id=?",
                Integer.class,
                owner))
        .isZero();
  }

  @Test
  void bookmarksAreUniquePerStudentVersionAndQuestion() {
    var row = bookmarkRow();
    insertPrivateRow("private_bookmarks", row);
    assertSqlViolation(
        "23505", "private_bookmarks_pkey", () -> insertPrivateRow("private_bookmarks", row));
  }

  @ParameterizedTest
  @ValueSource(strings = {"student_account_id", "version", "question_id", "created_at"})
  void bookmarksRejectNullRequiredFields(String field) {
    var row = bookmarkRow();
    row.put(field, null);
    assertSqlViolation("23502", null, () -> insertPrivateRow("private_bookmarks", row));
  }

  @ParameterizedTest
  @ValueSource(strings = {"student_account_id", "version", "question_id"})
  void bookmarksRejectMissingForeignIdentities(String field) {
    var row = bookmarkRow();
    row.put(
        field,
        field.equals("student_account_id")
            ? UUID.randomUUID()
            : field.equals("version") ? "missing" : 151);
    assertSqlViolation("23503", null, () -> insertPrivateRow("private_bookmarks", row));
  }

  @Test
  void deletingAQuestionCannotImplicitlyDeleteItsBookmark() {
    var row = bookmarkRow();
    insertPrivateRow("private_bookmarks", row);
    assertSqlViolation(
        "23503",
        "private_bookmarks_question_fk",
        () -> jdbc.update("delete from questions where version='hanbit-v1' and question_id=1"));
  }

  private java.util.LinkedHashMap<String, Object> bookmarkRow() {
    var row = new java.util.LinkedHashMap<String, Object>();
    row.put("student_account_id", student(1));
    row.put("version", VERSION);
    row.put("question_id", 1);
    row.put("created_at", now());
    return row;
  }

  @Test
  void bookmarkJpaRoundTripKeepsThePrincipalKeyAndMicrosecondActivationTime() {
    var owner = student(1);
    var key = new PrivateBookmarkId(owner, VERSION, 1);
    var bookmark = new PrivateBookmark(owner, VERSION, 1, clock.instant());
    entityManager.persist(bookmark);
    entityManager.flush();
    entityManager.clear();
    var stored = entityManager.find(PrivateBookmark.class, key);
    assertThat(stored.getStudentAccountId()).isEqualTo(owner);
    assertThat(stored.getVersion()).isEqualTo(VERSION);
    assertThat(stored.getQuestionId()).isEqualTo(1);
    assertThat(stored.getCreatedAt()).isEqualTo(Instant.parse("2026-10-12T00:00:00.123456Z"));
    entityManager.remove(stored);
    entityManager.flush();
    entityManager.clear();
    assertThat(entityManager.find(PrivateBookmark.class, key)).isNull();
  }

  private java.util.LinkedHashMap<String, Object> masteryRow(java.util.Map<String, Object> fact) {
    var row = new java.util.LinkedHashMap<String, Object>();
    row.put("student_account_id", fact.get("student_account_id"));
    row.put("version", VERSION);
    row.put("question_id", 1);
    row.put("first_correct_attempt_id", fact.get("id"));
    row.put("mastered_at", now());
    return row;
  }

  private java.util.LinkedHashMap<String, Object> queueRow() {
    var row = new java.util.LinkedHashMap<String, Object>();
    row.put("student_account_id", student(1));
    row.put("version", VERSION);
    row.put("question_id", 1);
    row.put("reason", "AUTO_FIRST_WRONG");
    row.put("active", true);
    row.put("created_at", now());
    row.put("released_at", null);
    return row;
  }

  private void insertPrivateRow(String table, java.util.LinkedHashMap<String, Object> row) {
    jdbc.update(
        "insert into "
            + table
            + "("
            + String.join(",", row.keySet())
            + ") values ("
            + String.join(",", java.util.Collections.nCopies(row.size(), "?"))
            + ")",
        row.values().toArray());
  }

  private void insertReview(java.util.LinkedHashMap<String, Object> row) {
    jdbc.update(
        "insert into review_attempts("
            + String.join(",", row.keySet())
            + ") values ("
            + String.join(",", java.util.Collections.nCopies(row.size(), "?"))
            + ")",
        row.values().toArray());
  }

  private UUID student(int number) {
    var school = fixtures.school("계약 학교 " + UUID.randomUUID());
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1", number);
    return fixtures.student(classroom, number, "학생", "별빛" + number).getId();
  }

  private void assertCheckViolation(String constraint, ThrowingCallable write) {
    assertSqlViolation("23514", constraint, write);
  }

  private void assertSqlViolation(String state, String constraint, ThrowingCallable write) {
    assertThatThrownBy(write)
        .isInstanceOfSatisfying(
            DataIntegrityViolationException.class,
            error ->
                assertThat(error.getMostSpecificCause())
                    .isInstanceOfSatisfying(
                        SQLException.class,
                        sqlError -> {
                          assertThat(sqlError.getSQLState()).isEqualTo(state);
                          if (constraint != null) {
                            assertThat(sqlError.getMessage()).contains("\"" + constraint + "\"");
                          }
                        }));
  }

  private void assertInvalidAttempt(
      int day,
      int attemptNumber,
      String state,
      int answered,
      int correct,
      int streak,
      boolean finished,
      String constraint) {
    var student = student(1);
    var progress = insertProgress(student);
    var session = UUID.randomUUID();
    insertSession(session, student, "COMPLETED", now());

    assertCheckViolation(
        constraint,
        () ->
            jdbc.update(
                "insert into day_attempts"
                    + "(id,session_id,day_progress_id,student_account_id,version,day,attempt_number,state,"
                    + "answered_count,correct_count,current_streak,catch_up,started_at,finished_at)"
                    + " values (?,?,?,?,?,?,?,?,?,?,?,false,?,?)",
                UUID.randomUUID(),
                session,
                progress,
                student,
                VERSION,
                day,
                attemptNumber,
                state,
                answered,
                correct,
                streak,
                now(),
                finished ? now() : null));
  }

  private Timestamp now() {
    return Timestamp.from(LearningTime.persistable(clock.instant()));
  }

  private UUID insertProgress(UUID student) {
    var id = UUID.randomUUID();
    jdbc.update(
        "insert into day_progress"
            + "(id,student_account_id,version,day,state,created_at,updated_at)"
            + " values (?,?,?,1,'IN_PROGRESS',?,?)",
        id,
        student,
        VERSION,
        now(),
        now());
    return id;
  }

  private void insertSession(UUID id, UUID student, String state, Timestamp deadline) {
    jdbc.update(
        "insert into learning_sessions"
            + "(id,student_account_id,version,mode,day,state,current_position,deadline_at,created_at,updated_at)"
            + " values (?,?,?,'FIRST',1,?,1,?,?,?)",
        id,
        student,
        VERSION,
        state,
        deadline,
        now(),
        now());
  }

  private void insertSessionQuestion(UUID session, int position, int questionId) {
    insertSessionQuestion(session, position, VERSION, questionId);
  }

  private void insertSessionQuestion(
      UUID session, int position, String version, int questionId) {
    jdbc.update(
        "insert into learning_session_questions(session_id,position,version,question_id)"
            + " values (?,?,?,?)",
        session,
        position,
        version,
        questionId);
  }

  private void insertContentVersion(String version) {
    jdbc.update(
        "insert into content_versions(version,digest,active) values (?,?,false)",
        version,
        "c".repeat(64));
    jdbc.update("insert into content_days(version,day,title) values (?,1,'다른 버전')", version);
    jdbc.update(
        "insert into questions"
            + "(version,question_id,day,position,text,answer,explanation,time_limit_seconds)"
            + " values (?,1,1,1,'다른 질문','O','다른 설명',10)",
        version);
  }

  private void insertAttempt(
      UUID id, UUID session, UUID progress, UUID student, int attemptNumber) {
    jdbc.update(
        "insert into day_attempts"
            + "(id,session_id,day_progress_id,student_account_id,version,day,attempt_number,state,"
            + "answered_count,correct_count,current_streak,catch_up,started_at,finished_at)"
            + " values (?,?,?,?,?,?,?,'PASSED',5,3,1,false,?,?)",
        id,
        session,
        progress,
        student,
        VERSION,
        1,
        attemptNumber,
        now(),
        now());
  }

  private void insertIdempotency(UUID student, String operation, UUID requestId) {
    jdbc.update(
        "insert into idempotency_records"
            + "(student_account_id,operation,request_id,payload_hash,response_json,created_at)"
            + " values (?,?,?,?,cast(? as jsonb),?)",
        student,
        operation,
        requestId,
        "a".repeat(64),
        "{\"ok\":true}",
        now());
  }

  private AnswerContext answerContext(int number) {
    return answerContext(student(number), VERSION);
  }

  private AnswerContext answerContext(UUID student, String version) {
    var progress = UUID.randomUUID();
    jdbc.update(
        "insert into day_progress"
            + "(id,student_account_id,version,day,state,created_at,updated_at)"
            + " values (?,?,?,1,'IN_PROGRESS',?,?)",
        progress, student, version, now(), now());
    var session = UUID.randomUUID();
    var attempt = UUID.randomUUID();
    jdbc.update(
        "insert into learning_sessions"
            + "(id,student_account_id,version,mode,day,state,current_position,deadline_at,created_at,updated_at)"
            + " values (?,?,?,'FIRST',1,'QUESTION_ACTIVE',1,?,?,?)",
        session,
        student,
        version,
        now(),
        now(),
        now());
    jdbc.update(
        "insert into day_attempts"
            + "(id,session_id,day_progress_id,student_account_id,version,day,attempt_number,state,"
            + "answered_count,correct_count,current_streak,catch_up,started_at)"
            + " values (?,?,?,?,?,?,1,'ACTIVE',0,0,0,false,?)",
        attempt,
        session,
        progress,
        student,
        version,
        1,
        now());
    return new AnswerContext(student, session, attempt);
  }

  private void insertFirstAnswer(
      UUID student, String version, int question, UUID session,
      UUID attempt, String choice, Boolean timedOut, Boolean correct) {
    jdbc.update(
        "insert into first_answers"
            + "(id,student_account_id,version,question_id,session_id,day_attempt_id,request_id,choice,timed_out,correct,answered_at,response_millis)"
            + " values (?,?,?,?,?,?,?,?,?,?,?,0)",
        UUID.randomUUID(),
        student,
        version,
        question,
        session,
        attempt,
        UUID.randomUUID(),
        choice,
        timedOut,
        correct,
        now());
  }

  private void insertLastAnswer(
      UUID student, String version, int question, String sourceType, UUID sourceId,
      String choice, Boolean timedOut, Boolean correct, String outcome) {
    jdbc.update(
        "insert into last_answers"
            + "(student_account_id,version,question_id,source_type,source_id,choice,timed_out,"
            + "correct,outcome,answered_at) values (?,?,?,?,?,?,?,?,?,?)",
        student, version, question, sourceType, sourceId, choice, timedOut, correct, outcome, now());
  }

  private void insertXpEntry(UUID student, String kind, UUID source, int amount, String rule) {
    jdbc.update(
        "insert into"
            + " xp_entries(id,student_account_id,kind,source_id,amount,rule_version,created_at)"
            + " values (?,?,?,?,?,?,?)",
        UUID.randomUUID(),
        student,
        kind,
        source,
        amount,
        rule,
        now());
  }

  private record AnswerContext(UUID student, UUID session, UUID attempt) {}
}
