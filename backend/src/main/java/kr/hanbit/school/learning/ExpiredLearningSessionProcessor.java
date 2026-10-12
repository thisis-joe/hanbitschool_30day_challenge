package kr.hanbit.school.learning;

import java.time.Instant;
import java.util.UUID;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class ExpiredLearningSessionProcessor {
  private final LearningAnswerFinalizer finalizer;
  private final LearningSessionRepository sessions;
  private final TransactionTemplate writes;
  private final TransactionTemplate freshReads;

  public ExpiredLearningSessionProcessor(
      LearningAnswerFinalizer finalizer,
      LearningSessionRepository sessions,
      PlatformTransactionManager transactions) {
    this.finalizer = finalizer;
    this.sessions = sessions;
    writes = new TransactionTemplate(transactions);
    writes.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    freshReads = new TransactionTemplate(transactions);
    freshReads.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    freshReads.setReadOnly(true);
  }

  public void expireOne(UUID sessionId, Instant observedAt) {
    try {
      writes.executeWithoutResult(status -> finalizer.finalizeExpired(sessionId, observedAt));
    } catch (RuntimeException failure) {
      if (!constraintFailure(failure)) throw failure;
      // execute has completed rollback. Never read through PostgreSQL's aborted transaction.
      boolean noLongerDue =
          Boolean.TRUE.equals(
              freshReads.execute(
                  status ->
                      sessions
                          .findById(sessionId)
                          .map(
                              session ->
                                  session.getState() != LearningSessionState.QUESTION_ACTIVE
                                      || !observedAt.isAfter(session.getDeadlineAt()))
                          .orElse(true)));
      if (!noLongerDue) throw failure;
    }
  }

  private boolean constraintFailure(Throwable failure) {
    if (failure instanceof DataIntegrityViolationException) return true;
    for (var cause = failure; cause != null; cause = cause.getCause()) {
      if (cause instanceof ConstraintViolationException violation
          && violation.getSQLState() != null
          && violation.getSQLState().startsWith("23")) return true;
    }
    return false;
  }
}
