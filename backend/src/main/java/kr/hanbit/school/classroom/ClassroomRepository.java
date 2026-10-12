package kr.hanbit.school.classroom;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClassroomRepository extends JpaRepository<Classroom, UUID> {
  Optional<Classroom> findBySchoolIdAndGradeLabelAndClassNumber(
      UUID schoolId, String gradeLabel, int classNumber);

  Optional<Classroom> findByJoinCode(String joinCode);

  java.util.List<Classroom> findBySchoolIdOrderByGradeLabelAscClassNumberAsc(UUID schoolId);
}
