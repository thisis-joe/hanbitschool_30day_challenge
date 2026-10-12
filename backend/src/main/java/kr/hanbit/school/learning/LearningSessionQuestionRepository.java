package kr.hanbit.school.learning;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LearningSessionQuestionRepository
    extends JpaRepository<LearningSessionQuestion, LearningSessionQuestionId> {
  List<LearningSessionQuestion> findByIdSessionIdOrderByIdPositionAsc(UUID sessionId);
}
