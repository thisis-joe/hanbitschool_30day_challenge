package kr.hanbit.school.learning;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DayProgressRepository extends JpaRepository<DayProgress, UUID> {
  Optional<DayProgress> findByStudentAccountIdAndVersionAndDay(
      UUID studentAccountId, String version, int day);

  List<DayProgress> findByStudentAccountIdAndVersionAndDayLessThanEqualOrderByDayAsc(
      UUID studentAccountId, String version, int day);

  long countByStudentAccountIdAndVersionAndState(
      UUID studentAccountId, String version, DayProgressState state);
}
