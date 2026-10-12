package kr.hanbit.school.account;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StudentProfileRepository extends JpaRepository<StudentProfile, UUID> {
  Optional<StudentProfile> findByClassroomIdAndStudentNumber(UUID classroomId, int studentNumber);

  java.util.List<StudentProfile> findByClassroomIdOrderByStudentNumber(UUID classroomId);

  long countByClassroomId(UUID classroomId);
}
