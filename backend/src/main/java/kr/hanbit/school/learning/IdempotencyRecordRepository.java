package kr.hanbit.school.learning;

import org.springframework.data.jpa.repository.JpaRepository;

public interface IdempotencyRecordRepository
    extends JpaRepository<IdempotencyRecord, IdempotencyRecordId> {}
