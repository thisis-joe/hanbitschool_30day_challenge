package kr.hanbit.school.learning;

import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "hanbit.learning.expiry-enabled", havingValue = "true")
public class ExpiredLearningSessionScheduler {
  private static final Logger log = LoggerFactory.getLogger(ExpiredLearningSessionScheduler.class);
  private final LearningSessionRepository sessions;
  private final ExpiredLearningSessionProcessor processor;
  private final Clock clock;
  private final int batchSize;

  public ExpiredLearningSessionScheduler(
      LearningSessionRepository sessions,
      ExpiredLearningSessionProcessor processor,
      Clock clock,
      @Value("${hanbit.learning.expiry-batch-size:100}") int batchSize) {
    if (batchSize < 1) throw new IllegalArgumentException("Expiry batch size must be positive");
    this.sessions = sessions;
    this.processor = processor;
    this.clock = clock;
    this.batchSize = batchSize;
  }

  @Scheduled(fixedDelayString = "${hanbit.learning.expiry-delay-ms:1000}")
  public void expireDueSessions() {
    var observedAt = clock.instant();
    var candidates = sessions.findExpiredIds(observedAt, PageRequest.of(0, batchSize));
    for (var sessionId : candidates) {
      try {
        processor.expireOne(sessionId, observedAt);
      } catch (RuntimeException failure) {
        // One broken candidate must not prevent other students' questions from expiring.
        log.warn(
            "Learning expiry failed; the session will be retried ({})",
            failure.getClass().getSimpleName());
      }
    }
  }
}
