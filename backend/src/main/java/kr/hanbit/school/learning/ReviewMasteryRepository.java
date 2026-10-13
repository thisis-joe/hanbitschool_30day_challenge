package kr.hanbit.school.learning;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewMasteryRepository extends JpaRepository<ReviewMastery, ReviewMasteryId> {
  List<ReviewMastery> findByIdStudentAccountIdInAndIdVersion(
      List<UUID> studentAccountIds, String version);
}
