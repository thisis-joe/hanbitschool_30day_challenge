package kr.hanbit.school.learning;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FirstAnswerRepository extends JpaRepository<FirstAnswer, UUID> {
  Optional<FirstAnswer> findByStudentAccountIdAndVersionAndQuestionId(
      UUID studentAccountId, String version, int questionId);

  long countByStudentAccountIdAndVersion(UUID studentAccountId, String version);

  List<FirstAnswer> findByStudentAccountIdAndVersionOrderByQuestionIdAsc(
      UUID studentAccountId, String version);
}
