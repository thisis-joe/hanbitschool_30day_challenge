package kr.hanbit.school.learning;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import kr.hanbit.school.account.StudentProfileRepository;
import kr.hanbit.school.classroom.ClassroomRepository;
import kr.hanbit.school.content.ContentCatalog;
import kr.hanbit.school.content.LearningQuestion;
import kr.hanbit.school.learning.xp.XpEntry;
import kr.hanbit.school.learning.xp.XpEntryRepository;
import kr.hanbit.school.learning.xp.XpKind;
import kr.hanbit.school.learning.xp.XpLedger;
import kr.hanbit.school.learning.xp.XpPolicy;
import kr.hanbit.school.shared.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class LearningAnswerFinalizer {
  private final LearningSessionRepository sessions;
  private final LearningSessionQuestionRepository sessionQuestions;
  private final LearningSessionModule sessionModule;
  private final ContentCatalog content;
  private final DayAttemptRepository attempts;
  private final DayProgressRepository progress;
  private final FirstAnswerRepository firstAnswers;
  private final LastAnswerRepository lastAnswers;
  private final XpEntryRepository xpEntries;
  private final XpPolicy xpPolicy;
  private final XpLedger xp;
  private final LearningIdempotency idempotency;
  private final RequestFingerprint fingerprints;
  private final ObjectMapper json;
  private final LearningCalendar calendar;
  private final StudentProfileRepository profiles;
  private final ClassroomRepository classrooms;

  public LearningAnswerFinalizer(
      LearningSessionRepository sessions,
      LearningSessionQuestionRepository sessionQuestions,
      LearningSessionModule sessionModule,
      ContentCatalog content,
      DayAttemptRepository attempts,
      DayProgressRepository progress,
      FirstAnswerRepository firstAnswers,
      LastAnswerRepository lastAnswers,
      XpEntryRepository xpEntries,
      XpPolicy xpPolicy,
      XpLedger xp,
      LearningIdempotency idempotency,
      RequestFingerprint fingerprints,
      ObjectMapper json,
      LearningCalendar calendar,
      StudentProfileRepository profiles,
      ClassroomRepository classrooms) {
    this.sessions = sessions;
    this.sessionQuestions = sessionQuestions;
    this.sessionModule = sessionModule;
    this.content = content;
    this.attempts = attempts;
    this.progress = progress;
    this.firstAnswers = firstAnswers;
    this.lastAnswers = lastAnswers;
    this.xpEntries = xpEntries;
    this.xpPolicy = xpPolicy;
    this.xp = xp;
    this.idempotency = idempotency;
    this.fingerprints = fingerprints;
    this.json = json;
    this.calendar = calendar;
    this.profiles = profiles;
    this.classrooms = classrooms;
  }

  @Transactional(propagation = Propagation.MANDATORY)
  AnswerResult finalizeClient(
      UUID studentId, UUID sessionId, SubmitAnswerCommand command, Instant receivedAt) {
    var session =
        sessions.findLockedOwned(sessionId, studentId).orElseThrow(LearningAnswerModule::notFound);
    requireActiveVersion(session);
    String hash = fingerprints.answer(sessionId, command);
    var replay =
        idempotency.replay(
            studentId,
            IdempotencyOperation.SUBMIT_ANSWER,
            command.requestId(),
            hash,
            AnswerResult.class);
    if (replay.isPresent()) return replay.get();

    var question = currentQuestion(session);
    if (question.getQuestionId() != command.questionId()
        || session.getState() != LearningSessionState.QUESTION_ACTIVE) {
      if (firstAnswers
          .findByStudentAccountIdAndVersionAndQuestionId(
              studentId, session.getVersion(), command.questionId())
          .isPresent()) throw LearningAnswerModule.alreadyFinalized();
      if (question.getQuestionId() != command.questionId())
        throw new ApiException(409, "QUESTION_MISMATCH", "현재 문항과 제출 문항이 일치하지 않습니다.");
      throw LearningAnswerModule.alreadyFinalized();
    }
    return finalizeLocked(session, question, command, receivedAt, hash);
  }

  @Transactional(propagation = Propagation.MANDATORY)
  Optional<AnswerResult> finalizeExpired(UUID sessionId, Instant observedAt) {
    var owned = sessions.findLockedById(sessionId);
    if (owned.isEmpty()) return Optional.empty();
    var session = owned.get();
    if (session.getState() != LearningSessionState.QUESTION_ACTIVE
        || !observedAt.isAfter(session.getDeadlineAt())) return Optional.empty();
    requireActiveVersion(session);
    var question = currentQuestion(session);
    var command =
        new SubmitAnswerCommand(
            ExpiryRequestId.forQuestion(
                sessionId, session.getCurrentPosition(), session.getDeadlineAt()),
            question.getQuestionId(),
            null);
    String hash = fingerprints.answer(sessionId, command);
    return Optional.of(finalizeLocked(session, question, command, observedAt, hash));
  }

  private AnswerResult finalizeLocked(
      LearningSession session,
      LearningQuestion question,
      SubmitAnswerCommand command,
      Instant receivedAt,
      String payloadHash) {
    if (session.getMode() != LearningMode.FIRST)
      throw new ApiException(409, "SESSION_CONFLICT", "현재는 FIRST 답변만 확정할 수 있습니다.");
    var attempt = attempts.findBySessionId(session.getId()).orElseThrow();
    var day = progress.findById(attempt.getDayProgressId()).orElseThrow();
    boolean timedOut = receivedAt.isAfter(session.getDeadlineAt());
    var choice = timedOut ? null : command.choice();
    boolean correct = !timedOut && choice == question.getAnswer();
    Instant now = LearningTime.persistable(receivedAt);
    long responseMillis =
        Math.max(
            0L,
            Duration.between(
                    session.getDeadlineAt().minusSeconds(question.getTimeLimitSeconds()),
                    receivedAt)
                .toMillis());
    var fact =
        firstAnswers.saveAndFlush(
            new FirstAnswer(
                UUID.randomUUID(),
                session.getStudentAccountId(),
                session.getVersion(),
                question.getQuestionId(),
                session.getId(),
                attempt.getId(),
                command.requestId(),
                choice,
                timedOut,
                correct,
                now,
                responseMillis));

    var lastKey =
        new LastAnswerId(
            session.getStudentAccountId(), session.getVersion(), question.getQuestionId());
    var last =
        lastAnswers
            .findById(lastKey)
            .orElseGet(
                () ->
                    new LastAnswer(
                        session.getStudentAccountId(),
                        session.getVersion(),
                        question.getQuestionId(),
                        AnswerSourceType.FIRST,
                        fact.getId(),
                        choice,
                        timedOut,
                        correct,
                        fact.getOutcome(),
                        now));
    last.update(
        AnswerSourceType.FIRST, fact.getId(), choice, timedOut, correct, fact.getOutcome(), now);
    lastAnswers.saveAndFlush(last);
    attempt.recordAnswer(correct, now);
    int awarded = xpPolicy.firstAnswer(correct, attempt.getCurrentStreak(), attempt.isCatchUp());
    appendXp(session.getStudentAccountId(), XpKind.FIRST_ANSWER, fact.getId(), awarded, now);

    boolean completed = attempt.getAnsweredCount() == 5;
    boolean nextDayAvailable = false;
    if (completed) {
      boolean passed = attempt.getState() == DayAttemptState.PASSED;
      day.finishFirst(passed, now);
      progress.saveAndFlush(day);
      if (passed) {
        int passXp = xpPolicy.firstPass(attempt.isCatchUp());
        appendXp(session.getStudentAccountId(), XpKind.FIRST_DAY_PASS, day.getId(), passXp, now);
        awarded += passXp;
        nextDayAvailable = nextDayAvailable(session);
      }
    }
    var summary = xp.summary(session.getStudentAccountId());
    var result =
        new AnswerResult(
            fact.getId(),
            question.getQuestionId(),
            fact.getOutcome(),
            question.getAnswer(),
            question.getExplanation(),
            awarded,
            summary.totalXp(),
            summary.level(),
            attempt.getCorrectCount(),
            attempt.getAnsweredCount(),
            attempt.getState(),
            day.getState(),
            nextDayAvailable,
            false);
    session.finalizeAnswer(json.writeValueAsString(result), completed, now);
    sessions.saveAndFlush(session);
    idempotency.record(
        session.getStudentAccountId(),
        IdempotencyOperation.SUBMIT_ANSWER,
        command.requestId(),
        payloadHash,
        result);
    return result;
  }

  private void appendXp(UUID studentId, XpKind kind, UUID sourceId, int amount, Instant at) {
    xpEntries.saveAndFlush(new XpEntry(UUID.randomUUID(), studentId, kind, sourceId, amount, at));
  }

  private boolean nextDayAvailable(LearningSession session) {
    var profile =
        profiles.findById(session.getStudentAccountId()).orElseThrow(ApiException::unauthorized);
    var classroom =
        classrooms.findById(profile.getClassroomId()).orElseThrow(ApiException::unauthorized);
    int cap = calendar.calendarCap(classroom.getStartDate());
    var earliest =
        sessionModule.earliestUnpassed(session.getStudentAccountId(), session.getVersion(), cap);
    return earliest != null && earliest > session.getDay();
  }

  private LearningQuestion currentQuestion(LearningSession session) {
    var row =
        sessionQuestions
            .findById(new LearningSessionQuestionId(session.getId(), session.getCurrentPosition()))
            .orElseThrow(() -> new IllegalStateException("현재 세션 문항을 찾을 수 없습니다."));
    sessionModule.requireActiveVersion(row.getVersion(), session.getVersion());
    return content.requireQuestion(session.getVersion(), row.getQuestionId());
  }

  private void requireActiveVersion(LearningSession session) {
    sessionModule.requireActiveVersion(session.getVersion(), content.activeVersion().getVersion());
  }
}
