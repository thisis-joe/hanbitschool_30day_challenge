package kr.hanbit.school.learning;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewAttemptRepository extends JpaRepository<ReviewAttempt, UUID> {
  boolean existsBySessionIdAndQuestionId(UUID sessionId, int questionId);

  long countBySessionId(UUID sessionId);

  long countBySessionIdAndCorrectTrue(UUID sessionId);
}
