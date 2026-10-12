package kr.hanbit.school.learning;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DayAttemptRepository extends JpaRepository<DayAttempt, UUID> {
  Optional<DayAttempt> findBySessionId(UUID sessionId);

  @Query(
      "select cast(coalesce(max(a.attemptNumber), 0) + 1 as integer) from DayAttempt a"
          + " where a.studentAccountId = :student and a.version = :version and a.day = :day")
  int nextAttemptNumber(
      @Param("student") UUID student, @Param("version") String version, @Param("day") int day);
}
