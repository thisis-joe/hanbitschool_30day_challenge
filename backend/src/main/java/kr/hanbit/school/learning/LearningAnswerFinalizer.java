package kr.hanbit.school.learning;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import kr.hanbit.school.account.StudentProfileRepository;
import kr.hanbit.school.classroom.ClassroomRepository;
import kr.hanbit.school.content.ContentCatalog;
import kr.hanbit.school.content.LearningQuestion;
import kr.hanbit.school.game.GameCatalog;
import kr.hanbit.school.game.RewardGrant;
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
  private final ReviewAttemptRepository reviewAttempts;
  private final ReviewMasteryRepository masteries;
  private final ReviewQueueEntryRepository reviewQueue;
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
  private final GameCatalog gameCatalog;

  public LearningAnswerFinalizer(
      LearningSessionRepository sessions,
      LearningSessionQuestionRepository sessionQuestions,
      LearningSessionModule sessionModule,
      ContentCatalog content,
      DayAttemptRepository attempts,
      DayProgressRepository progress,
      FirstAnswerRepository firstAnswers,
      ReviewAttemptRepository reviewAttempts,
      ReviewMasteryRepository masteries,
      ReviewQueueEntryRepository reviewQueue,
      LastAnswerRepository lastAnswers,
      XpEntryRepository xpEntries,
      XpPolicy xpPolicy,
      XpLedger xp,
      LearningIdempotency idempotency,
      RequestFingerprint fingerprints,
      ObjectMapper json,
      LearningCalendar calendar,
      StudentProfileRepository profiles,
      ClassroomRepository classrooms,
      GameCatalog gameCatalog) {
    this.sessions = sessions;
    this.sessionQuestions = sessionQuestions;
    this.sessionModule = sessionModule;
    this.content = content;
    this.attempts = attempts;
    this.progress = progress;
    this.firstAnswers = firstAnswers;
    this.reviewAttempts = reviewAttempts;
    this.masteries = masteries;
    this.reviewQueue = reviewQueue;
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
    this.gameCatalog = gameCatalog;
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
      if (hasFinalizedAnswer(session, command.questionId()))
        throw LearningAnswerModule.alreadyFinalized();
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
    boolean review = session.getMode() == LearningMode.REVIEW;
    var attempt = review ? null : attempts.findBySessionId(session.getId()).orElseThrow();
    var day = review ? null : progress.findById(attempt.getDayProgressId()).orElseThrow();
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
    UUID factId = UUID.randomUUID();
    AnswerOutcome outcome =
        timedOut ? AnswerOutcome.TIMED_OUT : correct ? AnswerOutcome.CORRECT : AnswerOutcome.WRONG;
    boolean first = session.getMode() == LearningMode.FIRST;
    if (first) {
      firstAnswers.saveAndFlush(
          new FirstAnswer(
              factId,
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
    } else {
      reviewAttempts.saveAndFlush(
          new ReviewAttempt(
              factId,
              session.getStudentAccountId(),
              session.getVersion(),
              question.getQuestionId(),
              session.getId(),
              review ? null : attempt.getId(),
              session.getMode(),
              command.requestId(),
              choice,
              timedOut,
              correct,
              outcome,
              now,
              responseMillis));
    }
    var sourceType = first ? AnswerSourceType.FIRST : AnswerSourceType.REPEAT;

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
                        sourceType,
                        factId,
                        choice,
                        timedOut,
                        correct,
                        outcome,
                        now));
    last.update(sourceType, factId, choice, timedOut, correct, outcome, now);
    lastAnswers.saveAndFlush(last);
    boolean reviewPromptEligible =
        updateReviewPolicy(session, question.getQuestionId(), factId, first, correct, now);
    if (!first && !review && attempt.getAnsweredCount() == 4)
      attempt.classifyReplayCompletion(
          calendar.isCatchUp(session.getDay(), currentCalendarCap(session)));
    if (!review) attempt.recordAnswer(correct, now);
    int awarded =
        first
            ? xpPolicy.firstAnswer(correct, attempt.getCurrentStreak(), attempt.isCatchUp())
            : xpPolicy.repeatAnswer();
    appendXp(
        session.getStudentAccountId(),
        first ? XpKind.FIRST_ANSWER : XpKind.REPEAT_ANSWER,
        factId,
        awarded,
        now);

    int answeredCount =
        review
            ? Math.toIntExact(reviewAttempts.countBySessionId(session.getId()))
            : attempt.getAnsweredCount();
    int correctCount =
        review
            ? Math.toIntExact(reviewAttempts.countBySessionIdAndCorrectTrue(session.getId()))
            : attempt.getCorrectCount();
    boolean completed =
        review
            ? answeredCount
                == sessionQuestions.findByIdSessionIdOrderByIdPositionAsc(session.getId()).size()
            : answeredCount == 5;
    boolean nextDayAvailable = false;
    RewardGrant rewardGranted = null;
    if (completed && !review) {
      boolean passed = attempt.getState() == DayAttemptState.PASSED;
      if (day.getState() != DayProgressState.PASSED) {
        day.finishFirst(passed, now);
        progress.saveAndFlush(day);
        if (passed) {
          int passXp = xpPolicy.firstPass(attempt.isCatchUp());
          appendXp(session.getStudentAccountId(), XpKind.FIRST_DAY_PASS, day.getId(), passXp, now);
          awarded += passXp;
          rewardGranted =
              new RewardGrant(
                  gameCatalog.rewardForDay(day.getDay()).itemId(),
                  day.getDay(),
                  day.getPassedAt());
        }
      }
      if (day.getState() == DayProgressState.PASSED) nextDayAvailable = nextDayAvailable(session);
    }
    var summary = xp.summary(session.getStudentAccountId());
    var result =
        new AnswerResult(
            factId,
            question.getQuestionId(),
            outcome,
            question.getAnswer(),
            question.getExplanation(),
            awarded,
            summary.totalXp(),
            summary.level(),
            correctCount,
            answeredCount,
            review ? null : attempt.getState(),
            review ? null : day.getState(),
            nextDayAvailable,
            reviewPromptEligible,
            rewardGranted);
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

  private boolean updateReviewPolicy(
      LearningSession session,
      int questionId,
      UUID factId,
      boolean first,
      boolean correct,
      Instant now) {
    var queueKey =
        new ReviewQueueEntryId(session.getStudentAccountId(), session.getVersion(), questionId);
    var entry = reviewQueue.findById(queueKey);
    if (first) {
      if (!correct && entry.isEmpty())
        reviewQueue.saveAndFlush(
            new ReviewQueueEntry(
                session.getStudentAccountId(),
                session.getVersion(),
                questionId,
                ReviewQueueReason.AUTO_FIRST_WRONG,
                true,
                now,
                null));
      return false;
    }
    var masteryKey =
        new ReviewMasteryId(session.getStudentAccountId(), session.getVersion(), questionId);
    boolean mastered = masteries.existsById(masteryKey);
    if (correct) {
      if (!mastered)
        masteries.saveAndFlush(
            new ReviewMastery(
                session.getStudentAccountId(), session.getVersion(), questionId, factId, now));
      entry.ifPresent(
          row -> {
            row.releaseAuto(now);
            reviewQueue.saveAndFlush(row);
          });
      return false;
    }
    boolean priorCorrect =
        mastered
            || firstAnswers
                .findByStudentAccountIdAndVersionAndQuestionId(
                    session.getStudentAccountId(), session.getVersion(), questionId)
                .map(FirstAnswer::isCorrect)
                .orElse(false);
    return priorCorrect
        && (entry.isEmpty()
            || !entry.get().isActive()
            || entry.get().getReason() != ReviewQueueReason.USER_AFTER_LATER_WRONG);
  }

  private void appendXp(UUID studentId, XpKind kind, UUID sourceId, int amount, Instant at) {
    xpEntries.saveAndFlush(new XpEntry(UUID.randomUUID(), studentId, kind, sourceId, amount, at));
  }

  private boolean nextDayAvailable(LearningSession session) {
    int cap = currentCalendarCap(session);
    var earliest =
        sessionModule.earliestUnpassed(session.getStudentAccountId(), session.getVersion(), cap);
    return earliest != null && earliest > session.getDay();
  }

  private int currentCalendarCap(LearningSession session) {
    var profile =
        profiles.findById(session.getStudentAccountId()).orElseThrow(ApiException::unauthorized);
    var classroom =
        classrooms.findById(profile.getClassroomId()).orElseThrow(ApiException::unauthorized);
    return calendar.calendarCap(classroom.getStartDate());
  }

  boolean hasFinalizedAnswer(LearningSession session, int questionId) {
    if (session.getMode() == LearningMode.FIRST)
      return firstAnswers
          .findByStudentAccountIdAndVersionAndQuestionId(
              session.getStudentAccountId(), session.getVersion(), questionId)
          .isPresent();
    return reviewAttempts.existsBySessionIdAndQuestionId(session.getId(), questionId);
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
