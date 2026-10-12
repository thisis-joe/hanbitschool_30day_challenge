package kr.hanbit.school.learning;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LastAnswerRepository extends JpaRepository<LastAnswer, LastAnswerId> {
  List<LastAnswer> findByIdStudentAccountIdAndIdVersion(UUID studentAccountId, String version);
}
