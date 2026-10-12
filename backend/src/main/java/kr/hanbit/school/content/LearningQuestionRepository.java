package kr.hanbit.school.content;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LearningQuestionRepository
    extends JpaRepository<LearningQuestion, LearningQuestionId> {
  Optional<LearningQuestion> findByIdVersionAndIdQuestionId(String version, int questionId);

  List<LearningQuestion> findByIdVersionAndDayOrderByPositionAsc(String version, int day);

  List<LearningQuestion> findByIdVersionOrderByIdQuestionIdAsc(String version);
}
