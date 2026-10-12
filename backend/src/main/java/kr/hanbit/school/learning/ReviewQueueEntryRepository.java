package kr.hanbit.school.learning;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewQueueEntryRepository
    extends JpaRepository<ReviewQueueEntry, ReviewQueueEntryId> {}
