package kr.hanbit.school.learning;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import kr.hanbit.school.content.ContentCatalog;
import kr.hanbit.school.security.AccountPrincipal;
import kr.hanbit.school.shared.web.ApiException;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class LearningAnswerModule {
  private final StudentLearningAccess access;
  private final LearningAnswerFinalizer finalizer;
  private final LearningSessionModule sessionModule;
  private final LearningSessionRepository sessions;
  private final LearningSessionQuestionRepository sessionQuestions;
  private final ContentCatalog content;
  private final LearningIdempotency idempotency;
  private final RequestFingerprint fingerprints;
  private final Clock clock;
  private final TransactionTemplate writes;
  private final TransactionTemplate freshReads;

  public LearningAnswerModule(
      StudentLearningAccess access,
      LearningAnswerFinalizer finalizer,
      LearningSessionModule sessionModule,
      LearningSessionRepository sessions,
      LearningSessionQuestionRepository sessionQuestions,
      ContentCatalog content,
      LearningIdempotency idempotency,
      RequestFingerprint fingerprints,
      Clock clock,
      PlatformTransactionManager transactions) {
    this.access = access;
    this.finalizer = finalizer;
    this.sessionModule = sessionModule;
    this.sessions = sessions;
    this.sessionQuestions = sessionQuestions;
    this.content = content;
    this.idempotency = idempotency;
    this.fingerprints = fingerprints;
    this.clock = clock;
    writes = new TransactionTemplate(transactions);
    writes.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    freshReads = new TransactionTemplate(transactions);
    freshReads.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    freshReads.setReadOnly(true);
  }

  public AnswerResult answer(
      AccountPrincipal principal, UUID sessionId, SubmitAnswerCommand command) {
    // Keep nanoseconds and capture before authentication, transaction setup, or lock contention.
    Instant receivedAt = clock.instant();
    try {
      return writes.execute(
          status -> {
            var student = access.requireStudent(principal);
            validateAnswer(sessionId, command);
            return finalizer.finalizeClient(
                student.studentAccountId(), sessionId, command, receivedAt);
          });
    } catch (DataIntegrityViolationException failure) {
      // execute() has finished rollback. PostgreSQL reads must use a new transaction here.
      return freshReads.execute(
          status -> {
            var student = access.requireStudent(principal);
            var owned =
                sessions
                    .findOwned(sessionId, student.studentAccountId())
                    .orElseThrow(LearningAnswerModule::notFound);
            sessionModule.requireActiveVersion(
                owned.getVersion(), content.activeVersion().getVersion());
            var replay =
                idempotency.replay(
                    student.studentAccountId(),
                    IdempotencyOperation.SUBMIT_ANSWER,
                    command.requestId(),
                    fingerprints.answer(sessionId, command),
                    AnswerResult.class);
            if (replay.isPresent()) return replay.get();
            if (finalizer.hasFinalizedAnswer(owned, command.questionId())) throw alreadyFinalized();
            throw failure;
          });
    }
  }

  public LearningSessionView advance(
      AccountPrincipal principal, UUID sessionId, AdvanceLearningSessionCommand command) {
    try {
      return writes.execute(
          status -> {
            var student = access.requireStudent(principal);
            validateAdvance(sessionId, command);
            var session =
                sessions
                    .findLockedOwned(sessionId, student.studentAccountId())
                    .orElseThrow(LearningAnswerModule::notFound);
            String version = content.activeVersion().getVersion();
            sessionModule.requireActiveVersion(session.getVersion(), version);
            String hash = fingerprints.advance(sessionId, command);
            var replay =
                idempotency.replay(
                    student.studentAccountId(),
                    IdempotencyOperation.ADVANCE_SESSION,
                    command.requestId(),
                    hash,
                    LearningSessionView.class);
            if (replay.isPresent()) return replay.get();
            if (session.getState() == LearningSessionState.QUESTION_ACTIVE)
              throw new ApiException(409, "SESSION_CONFLICT", "현재 문항의 답변을 먼저 확정해 주세요.");
            if (session.getState() == LearningSessionState.AWAITING_ADVANCE) {
              var row =
                  sessionQuestions
                      .findById(
                          new LearningSessionQuestionId(
                              sessionId, session.getCurrentPosition() + 1))
                      .orElseThrow(() -> new IllegalStateException("다음 세션 문항을 찾을 수 없습니다."));
              sessionModule.requireActiveVersion(row.getVersion(), version);
              var question = content.requireQuestion(version, row.getQuestionId());
              var now = LearningTime.persistable(clock.instant());
              session.openNextQuestion(
                  LearningTime.deadline(clock, question.getTimeLimitSeconds()), now);
              sessions.saveAndFlush(session);
            }
            var view = sessionModule.view(session, version);
            idempotency.record(
                student.studentAccountId(),
                IdempotencyOperation.ADVANCE_SESSION,
                command.requestId(),
                hash,
                view);
            return view;
          });
    } catch (RuntimeException failure) {
      // Direct EntityManager.flush can expose Hibernate's exception without Spring translation.
      // Keep the existing translated-constraint path, and recognize only the idempotency PK
      // collision among other persistence/runtime failures. execute() has already rolled back.
      if (!(failure instanceof DataIntegrityViolationException)
          && !idempotencyKeyCollision(failure)) throw failure;
      return freshReads.execute(
          status -> {
            var student = access.requireStudent(principal);
            var owned =
                sessions
                    .findOwned(sessionId, student.studentAccountId())
                    .orElseThrow(LearningAnswerModule::notFound);
            sessionModule.requireActiveVersion(
                owned.getVersion(), content.activeVersion().getVersion());
            return idempotency
                .replay(
                    student.studentAccountId(),
                    IdempotencyOperation.ADVANCE_SESSION,
                    command.requestId(),
                    fingerprints.advance(sessionId, command),
                    LearningSessionView.class)
                .orElseThrow(() -> failure);
          });
    }
  }

  private boolean idempotencyKeyCollision(Throwable failure) {
    for (var cause = failure; cause != null; cause = cause.getCause()) {
      if (cause instanceof ConstraintViolationException violation
          && "23505".equals(violation.getSQLState())
          && "idempotency_records_pkey".equals(violation.getConstraintName())) return true;
    }
    return false;
  }

  private void validateAnswer(UUID sessionId, SubmitAnswerCommand command) {
    if (sessionId == null) throw ApiException.validation("sessionId", "세션 ID를 입력해 주세요.");
    if (command == null) throw ApiException.validation("request", "요청 내용을 입력해 주세요.");
    if (command.requestId() == null) throw ApiException.validation("requestId", "요청 ID를 입력해 주세요.");
    if (command.questionId() < 1 || command.questionId() > 150)
      throw ApiException.validation("questionId", "문항은 1에서 150 사이여야 합니다.");
    if (command.choice() == null) throw ApiException.validation("choice", "O 또는 X를 선택해 주세요.");
  }

  private void validateAdvance(UUID sessionId, AdvanceLearningSessionCommand command) {
    if (sessionId == null) throw ApiException.validation("sessionId", "세션 ID를 입력해 주세요.");
    if (command == null) throw ApiException.validation("request", "요청 내용을 입력해 주세요.");
    if (command.requestId() == null) throw ApiException.validation("requestId", "요청 ID를 입력해 주세요.");
  }

  static ApiException notFound() {
    return new ApiException(404, "NOT_FOUND", "요청한 항목을 찾을 수 없습니다.");
  }

  static ApiException alreadyFinalized() {
    return new ApiException(409, "ANSWER_ALREADY_FINALIZED", "이미 확정된 문항입니다.");
  }
}
