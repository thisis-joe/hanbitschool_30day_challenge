package kr.hanbit.school.learning;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReviewQueueEntryRepository
    extends JpaRepository<ReviewQueueEntry, ReviewQueueEntryId> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select e from ReviewQueueEntry e where e.id = :id")
  Optional<ReviewQueueEntry> findLockedById(@Param("id") ReviewQueueEntryId id);
}
