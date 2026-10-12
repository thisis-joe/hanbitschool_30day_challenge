package kr.hanbit.school.account;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StudentProfileRepository extends JpaRepository<StudentProfile, UUID> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from StudentProfile p where p.accountId = :accountId")
  Optional<StudentProfile> findLockedByAccountId(@Param("accountId") UUID accountId);

  Optional<StudentProfile> findByClassroomIdAndStudentNumber(UUID classroomId, int studentNumber);

  java.util.List<StudentProfile> findByClassroomIdOrderByStudentNumber(UUID classroomId);

  long countByClassroomId(UUID classroomId);
}
