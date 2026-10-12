package kr.hanbit.school.learning;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LearningSessionRepository extends JpaRepository<LearningSession, UUID> {
  @Query(
      "select s from LearningSession s where s.studentAccountId = :studentAccountId"
          + " and s.state <> kr.hanbit.school.learning.LearningSessionState.COMPLETED")
  Optional<LearningSession> findActiveByStudentAccountId(
      @Param("studentAccountId") UUID studentAccountId);

  @Query(
      "select s from LearningSession s where s.id = :sessionId"
          + " and s.studentAccountId = :studentAccountId")
  Optional<LearningSession> findOwned(
      @Param("sessionId") UUID sessionId,
      @Param("studentAccountId") UUID studentAccountId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query(
      "select s from LearningSession s where s.id = :sessionId"
          + " and s.studentAccountId = :studentAccountId")
  Optional<LearningSession> findLockedOwned(
      @Param("sessionId") UUID sessionId,
      @Param("studentAccountId") UUID studentAccountId);

  @Query(
      "select s.id from LearningSession s"
          + " where s.state = kr.hanbit.school.learning.LearningSessionState.QUESTION_ACTIVE"
          + " and s.deadlineAt <= :observedAt order by s.deadlineAt, s.id")
  List<UUID> findExpiredIds(@Param("observedAt") Instant observedAt, Pageable page);
}
