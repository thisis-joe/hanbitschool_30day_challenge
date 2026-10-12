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

  @Test
  void firstAnswerRejectsANullChoiceUnlessItIsTimedOut() {
    var context = answerContext(1);

    assertThatThrownBy(
            () ->
                jdbc.update(
                    "insert into first_answers"
                        + "(id,student_account_id,version,question_id,session_id,day_attempt_id,request_id,"
                        + "choice,timed_out,correct,answered_at,response_millis)"
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
                        + "(id,student_account_id,version,question_id,session_id,day_attempt_id,request_id,"
                        + "choice,timed_out,correct,answered_at,response_millis)"
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

  private UUID student(int number) {
    var school = fixtures.school("계약 학교 " + UUID.randomUUID());
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1", number);
    return fixtures.student(classroom, number, "학생", "별빛" + number).getId();
  }

  private void assertCheckViolation(String constraint, ThrowingCallable write) {
    assertThatThrownBy(write)
        .isInstanceOfSatisfying(
            DataIntegrityViolationException.class,
            error ->
                assertThat(error.getMostSpecificCause())
                    .isInstanceOfSatisfying(
                        SQLException.class,
                        sqlError -> {
                          assertThat(sqlError.getSQLState()).isEqualTo("23514");
                          assertThat(sqlError.getMessage()).contains("\"" + constraint + "\"");
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
    var student = student(number);
    var progress = insertProgress(student);
    var session = UUID.randomUUID();
    var attempt = UUID.randomUUID();
    insertSession(session, student, "QUESTION_ACTIVE", now());
    jdbc.update(
        "insert into day_attempts"
            + "(id,session_id,day_progress_id,student_account_id,version,day,attempt_number,state,"
            + "answered_count,correct_count,current_streak,catch_up,started_at)"
            + " values (?,?,?,?,?,?,1,'ACTIVE',0,0,0,false,?)",
        attempt,
        session,
        progress,
        student,
        VERSION,
        1,
        now());
    return new AnswerContext(student, session, attempt);
  }

  private record AnswerContext(UUID student, UUID session, UUID attempt) {}
}
